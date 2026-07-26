// server.js — complete file, safe to fully replace what's on Railway now.
require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const crypto = require("crypto");
const admin = require("firebase-admin");

// ---- Firebase setup ----
// On Railway, paste your full service account JSON as one env var
// named FIREBASE_SERVICE_ACCOUNT (Settings → Variables), not as a file.
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
});
const db = admin.firestore();

// ---- Express setup ----
const app = express();
app.use(express.json());

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;

// ---- Route 1: verify a Flutterwave bank transfer after checkout ----
app.post("/api/verify-payment", async (req, res) => {
  const { transaction_id, expected_amount, tx_ref } = req.body;
  if (!transaction_id) {
    return res.status(400).json({ verified: false, reason: "missing transaction_id" });
  }

  try {
    const flwRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      { headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` } }
    );
    const flwData = await flwRes.json();

    if (flwData.status !== "success") {
      return res.json({ verified: false, reason: "flutterwave lookup failed" });
    }

    const tx = flwData.data;
    const verified =
      tx.status === "successful" &&
      tx.amount >= Number(expected_amount) &&
      tx.currency === "NGN" &&
      tx.tx_ref === tx_ref;

    if (!verified) {
      return res.json({ verified: false, reason: `status=${tx.status} amount=${tx.amount} currency=${tx.currency}` });
    }

    await db.collection("bank_payments").doc(String(tx.id)).set({
      type: "BANK",
      txRef: tx.tx_ref,
      amount: tx.amount,
      currency: tx.currency,
      customerEmail: tx.customer?.email,
      status: "confirmed",
      source: "callback",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.json({ verified: true, transaction: tx });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ verified: false, reason: "server error" });
  }
});

// ---- Route 2: record a confirmed on-chain EFC payment ----
app.post("/api/record-efc-payment", async (req, res) => {
  const { txHash, from, to, amount, ref, blockNumber } = req.body;
  try {
    await db.collection("efc_payments").doc(txHash).set({
      type: "EFC",
      txHash, from, to, amount, ref, blockNumber,
      status: "confirmed",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// ---- Route 3: Flutterwave webhook (backup if the browser callback never fires) ----
app.post("/webhook/flutterwave", async (req, res) => {
  const signature = req.headers["verif-hash"];
  if (!signature || signature !== process.env.FLW_WEBHOOK_SECRET_HASH) {
    return res.status(401).end();
  }

  const event = req.body;
  if (event.status === "successful") {
    await db.collection("bank_payments").doc(String(event.id)).set({
      type: "BANK",
      txRef: event.tx_ref,
      amount: event.amount,
      currency: event.currency,
      customerEmail: event.customer?.email,
      status: "confirmed",
      source: "webhook",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  res.status(200).end();
});

// ---- Start server — Railway assigns PORT dynamically ----
app.listen(process.env.PORT || 3000, () => console.log("Efikcoin server running"));
