// server.js
// Run: npm install express node-fetch dotenv
// Set FLW_SECRET_KEY in a .env file — NEVER in client code, NEVER shared in chat.

require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const app = express();
app.use(express.json());

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY; // e.g. FLWSECK_TEST-xxxxxxxx (or live)

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
    const statusOk = tx.status === "successful";
    const amountOk = tx.amount >= Number(expected_amount);
    const currencyOk = tx.currency === "NGN";
    const refOk = tx.tx_ref === tx_ref;

    const verified = statusOk && amountOk && currencyOk && refOk;

    if (!verified) {
      return res.json({
        verified: false,
        reason: `status=${tx.status} amount=${tx.amount} currency=${tx.currency}`
      });
    }

    // ---- Payment is real and confirmed. Do your fulfillment here: ----
    // e.g. write to Firestore, credit EFC to the buyer's wallet, mark order paid.
    // recordConfirmedPayment(tx);

    return res.json({ verified: true, transaction: tx });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ verified: false, reason: "server error" });
  }
});

app.listen(3000, () => console.log("Payment verification server running on port 3000"));
