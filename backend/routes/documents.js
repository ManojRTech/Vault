import express from "express";
import multer from "multer";
import { verifyToken } from "./middleware.js";
import { query } from "../db.js";
import crypto from "crypto";
import AES from "crypto-js";          // or node's crypto
import { create } from "ipfs-http-client";
import secrets from "secrets.js-grempe"; // for Shamir's secret sharing

const router = express.Router();
const ipfs = create({ url: "https://ipfs.infura.io:5001/api/v0" }); // IPFS node

const storage = multer.memoryStorage(); // store in memory for encryption
const upload = multer({ storage });

router.post("/upload", verifyToken, upload.single("document"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // 1. Generate AES key
    const aesKey = crypto.randomBytes(32); // 256-bit key
    const iv = crypto.randomBytes(16);     // random IV

    // 2. Encrypt file
    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
    const encrypted = Buffer.concat([cipher.update(req.file.buffer), cipher.final()]);
    
    // 3. Upload to IPFS
    const { cid } = await ipfs.add(encrypted);

    // 4. Split AES key into 3 shares
    const hexKey = aesKey.toString('hex');
    const shares = secrets.share(hexKey, 3, 2); // 3 shares, need 2 to reconstruct

    // 5. Save document entry
    const docResult = await query(
      "INSERT INTO documents(user_id, cid, ciphertext_hash, iv_hex) VALUES($1,$2,$3,$4) RETURNING id",
      [req.userId, cid.toString(), crypto.createHash('sha256').update(encrypted).digest('hex'), iv.toString('hex')]
    );

    const docId = docResult.rows[0].id;

    // 6. Save key shares
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
