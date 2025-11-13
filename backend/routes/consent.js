// routes/consent.js
import express from "express";
import { verifyToken } from "./middleware.js";
import { query } from "../db.js";

const router = express.Router();

// Give consent
router.post("/:docId", verifyToken, async (req, res) => {
  try {
    const docId = req.params.docId;

    // Insert or update consent
    await query(
      `INSERT INTO consent(doc_id, user_id, consent_given)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (user_id, doc_id)
       DO UPDATE SET consent_given = TRUE`,
      [docId, req.userId]
    );

    res.json({ message: "Consent given successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Revoke consent
router.delete("/:docId", verifyToken, async (req, res) => {
  try {
    const docId = req.params.docId;

    await query(
      `UPDATE consent
       SET consent_given = FALSE
       WHERE user_id = $1 AND doc_id = $2`,
      [req.userId, docId]
    );

    res.json({ message: "Consent revoked successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
