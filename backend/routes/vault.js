import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db.js';
import { encryptBuffer, splitKey, combineShares } from '../utils/crypto.js';
import { uploadBuffer } from '../utils/ipfs.js';

const router = express.Router();
const upload = multer();

const TRUSTEES = ['user', 'govt', 'verifier'];

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).send('No token');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).send('Invalid token');
  }
}

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  const fileBuffer = req.file.buffer;

  const { key, payload } = encryptBuffer(fileBuffer);
  const cid = await uploadBuffer(payload);
  const sha256 = crypto.createHash('sha256').update(payload).digest('hex');

  const docRes = await query(
    'INSERT INTO docs(user_id, cid, ciphertext_hash) VALUES($1,$2,$3) RETURNING id',
    [req.userId, cid, sha256]
  );
  const docId = docRes.rows[0].id;

  const shares = splitKey(key, 3, 3);
  const simpleEncrypt = (s) => Buffer.from(s, 'utf8').toString('base64');

  for (let i = 0; i < TRUSTEES.length; i++) {
    const encShare = simpleEncrypt(shares[i]);
    await query(
      'INSERT INTO key_shares(doc_id, trustee_role, encrypted_share) VALUES($1,$2,$3)',
      [docId, TRUSTEES[i], encShare]
    );
  }

  const vc = {
    issuer: 'demo-issuer',
    subject_did: (await query('SELECT did FROM users WHERE id=$1', [req.userId])).rows[0].did,
    cid,
    issuedAt: new Date().toISOString(),
  };

  res.json({ cid, docId, vc });
});

router.post('/reconstruct', authMiddleware, async (req, res) => {
  const { docId } = req.body;
  const r = await query(
    'SELECT encrypted_share FROM key_shares WHERE doc_id=$1 ORDER BY id',
    [docId]
  );
  if (r.rows.length < 3) return res.status(400).json({ error: 'Not enough shares' });

  const simpleDecrypt = (s) => Buffer.from(s, 'base64').toString('utf8');
  const shares = r.rows.map((row) => simpleDecrypt(row.encrypted_share));
  const key = combineShares(shares);

  res.json({ key: key.toString('base64') });
});

export default router;
