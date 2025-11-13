import express from "express";
import { verifyToken } from "./middleware.js";
import { query } from "../db.js";

const router = express.Router();

router.get("/:docId", verifyToken, async (req, res) => {
  try {
    const docId = req.params.docId;

    // 1. Check consent
    const consentRes = await query(
      "SELECT consent_given FROM consent WHERE user_id=$1 AND doc_id=$2",
      [req.userId, docId]
    );
    if (!consentRes.rows[0] || !consentRes.rows[0].consent_given) {
      return res.status(403).json({ error: "Consent not given" });
    }

    // 2. Fetch document info
    const docRes = await query("SELECT cid, ciphertext_hash FROM documents WHERE id=$1", [docId]);
    if (!docRes.rows[0]) return res.status(404).json({ error: "Document not found" });

    // 3. Fetch key shares
    const sharesRes = await query("SELECT share FROM key_shares WHERE doc_id=$1 LIMIT 2", [docId]);

    res.json({
      cid: docRes.rows[0].cid,
      shares: sharesRes.rows.map(s => s.share)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
