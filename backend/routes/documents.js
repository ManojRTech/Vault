import { NFTStorage, File } from 'nft.storage';
import crypto from 'crypto';
import secrets from 'secrets.js-grempe';
import { query } from '../db.js';
import multer from 'multer';
import express from 'express';
import { verifyToken } from './middleware.js';

const router = express.Router();

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ⚡ Configure NFT.Storage client
const client = new NFTStorage({ token: process.env.NFT_STORAGE_TOKEN });

router.post("/upload", verifyToken, upload.single("document"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // AES encryption
    const aesKey = crypto.randomBytes(32);
    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, aesKey.slice(0, 16));
    const encrypted = Buffer.concat([cipher.update(req.file.buffer), cipher.final()]);

    // Upload encrypted file to NFT.Storage
    const file = new File([encrypted], req.file.originalname);
    const cid = await client.storeBlob(file);


    // Split AES key into shares
    const hexKey = aesKey.toString('hex');
    const shares = secrets.share(hexKey, 3, 2);

    // Save in DB
    const docResult = await query(
      "INSERT INTO documents(user_id, cid, ciphertext_hash) VALUES($1,$2,$3) RETURNING id",
      [req.userId, cid.toString(), crypto.createHash('sha256').update(encrypted).digest('hex')]
    );

    const docId = docResult.rows[0].id;
    const nodeTypes = ['user', 'gov', 'verifier'];

    for (let i = 0; i < shares.length; i++) {
      await query(
        "INSERT INTO key_shares(user_id, doc_id, share, node_type) VALUES($1,$2,$3,$4)",
        [req.userId, docId, shares[i], nodeTypes[i]]
      );
    }

    res.json({ message: "Document uploaded successfully", cid: cid.toString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
