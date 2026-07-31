const express = require("express");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

const app = express();
app.use(cors());

// Firebase Admin init — service account JSON stored as a single env var on Render
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
});
const db = admin.firestore();

const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;
const FLW_WEBHOOK_HASH = process.env.FLUTTERWAVE_WEBHOOK_HASH;

// Webhook needs raw body for signature safety — mount before express.json()
app.post("/webhook/flutterwave", express.json(), async (req, res) => {
  const signature = req.headers["verif-hash"];
  if (!signature || signature !== FLW_WEBHOOK_HASH) {
    return res.status(401).send("Invalid signature");
  }

  const event = req.body;
  if (event.event !== "charge.completed" || event.data.status !== "successful") {
    return res.status(200).send("Ignored");
  }

  const txRef = event.data.tx_ref;
  const txDocRef = db.collection("fiatTransactions").doc(txRef);

  // Re-verify directly with Flutterwave — never trust the webhook payload alone
  const verifyRes = await fetch(
    `https://api.flutterwave.com/v3/transactions/${event.data.id}/verify`,
    { headers: { Authorization: `Bearer ${FLW_SECRET}` } }
  );
  const verifyData = await verifyRes.json();

  if (
    verifyData.data.status !== "successful" ||
    verifyData.data.amount < event.data.amount ||
    verifyData.data.currency !== "NGN"
  ) {
    await txDocRef.update({ status: "failed" });
    return res.status(200).send("Verification mismatch");
  }

  await db.runTransaction(async (t) => {
    const snap = await t.get(txDocRef);
    if (!snap.exists || snap.data().status === "success") return; // idempotency guard

    t.update(txDocRef, {
      status: "success",
      flutterwaveTransactionId: event.data.id,
      confirmedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const clientRef = db.collection("clients").doc(snap.data().clientId);
    t.update(clientRef, {
      fiatBalance: admin.firestore.FieldValue.increment(snap.data().amount),
      fiatBalanceUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  res.status(200).send("OK");
});

app.use(express.json());

// Initiate a top-up
app.post("/api/topup/initiate", async (req, res) => {
  try {
    const { clientId, amountNaira } = req.body;
    if (!clientId || !amountNaira || amountNaira <= 0) {
      return res.status(400).json({ error: "clientId and amountNaira required" });
    }

    const txRef = `efc-topup-${uuidv4()}`;

    await db.collection("fiatTransactions").doc(txRef).set({
      clientId,
      type: "topup",
      amount: Math.round(amountNaira * 100), // kobo
      status: "pending",
      flutterwaveRef: txRef,
      flutterwaveTransactionId: null,
      provider: "flutterwave",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmedAt: null,
      meta: {}
    });

    const clientDoc = await db.collection("clients").doc(clientId).get();
    const clientEmail = clientDoc.data()?.email || "client@efikcoin.xyz";

    const flwRes = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FLW_SECRET}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: amountNaira,
        currency: "NGN",
        redirect_url: "https://efcpay.efikcoin.xyz/topup-complete",
        customer: { email: clientEmail },
        customizations: { title: "Efikcoin Wallet Top-up" }
      })
    });

    const flwData = await flwRes.json();
    if (flwData.status !== "success") {
      await db.collection("fiatTransactions").doc(txRef).update({ status: "failed" });
      return res.status(502).json({ error: "Payment init failed" });
    }

    res.json({ paymentLink: flwData.data.link, txRef });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Check a client's fiat balance
app.get("/api/balance/:clientId", async (req, res) => {
  const doc = await db.collection("clients").doc(req.params.clientId).get();
  if (!doc.exists) return res.status(404).json({ error: "Client not found" });
  res.json({ fiatBalance: doc.data().fiatBalance || 0 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`efcpay backend running on port ${PORT}`));
