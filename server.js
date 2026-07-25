const crypto = require("crypto");

app.post("/webhook/flutterwave", express.json(), async (req, res) => {
  // Flutterwave signs every webhook with a secret hash YOU set in your dashboard.
  // This check proves the request really came from Flutterwave, not an attacker.
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

  res.status(200).end(); // always respond 200 quickly, or Flutterwave retries
});
