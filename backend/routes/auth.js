import express from 'express';
import { query } from '../db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const pwHash = await bcrypt.hash(password, 10);

  // generate keypair for DID
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  const did =
    'did:key:' +
    crypto.createHash('sha256').update(pubPem).digest('hex').slice(0, 16);

  const result = await query(
    'INSERT INTO users(username, password_hash, did, pubkey) VALUES($1,$2,$3,$4) RETURNING id',
    [username, pwHash, did, pubPem]
  );

  const user = { id: result.rows[0].id, username, did, privPem };
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: '8h',
  });

  res.json({ token, did, privPem });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const r = await query('SELECT * FROM users WHERE username=$1', [username]);
  if (r.rows.length === 0)
    return res.status(401).json({ error: 'Invalid credentials' });

  const u = r.rows[0];
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ userId: u.id }, process.env.JWT_SECRET, {
    expiresIn: '8h',
  });

  res.json({ token, did: u.did });
});

export default router;
