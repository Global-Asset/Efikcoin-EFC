const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch"); // Works with Node 18+ or node-fetch v2/v3

const app = express();

app.use(cors());
app.use(express.json());

// Load Flutterwave Secret Key from Render Environment
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY ? process.env.FLW_SECRET_KEY.trim() : "";

// Diagnostic Startup Check
console.log("=========================================");
console.log("🚀 EFC PAY BACKEND SERVER STARTING");
if (!FLW_SECRET_KEY) {
    console.error("❌ CRITICAL ERROR: FLW_SECRET_KEY environment variable is MISSING on Render!");
} else if (!FLW_SECRET_KEY.startsWith("FLWSECK-")) {
    console.warn("⚠️ WARNING: FLW_SECRET_KEY does not start with 'FLWSECK-'. Double check your live secret key.");
} else {
    console.log("✅ FLW_SECRET_KEY loaded successfully (Prefix: " + FLW_SECRET_KEY.substring(0, 12) + "...)");
}
console.log("=========================================");

// -------------------------------------------------------------
// 1. HEALTH CHECK ENDPOINT
// -------------------------------------------------------------
app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "EFC Pay Merchant Backend",
        key_configured: Boolean(FLW_SECRET_KEY)
    });
});

// -------------------------------------------------------------
// 2. UTILITY & BILL PAYMENTS (AIRTIME, DATA, ELECTRICITY)
// -------------------------------------------------------------
app.post("/api/merchant/pay-bill", async (req, res) => {
    try {
        const { customer, amount, type, country } = req.body;

        console.log(`\n[BILL REQUEST] Type: ${type} | Customer: ${customer} | Amount: ${amount}`);

        if (!FLW_SECRET_KEY) {
            console.error("[BILL ERROR] Secret Key is not configured on server.");
            return res.status(500).json({ success: false, error: "Server Configuration Error: Missing FLW_SECRET_KEY" });
        }

        const payload = {
            country: country || "NG",
            customer: String(customer).trim(),
            amount: Number(amount),
            type: type, // "AIRTIME", "MOBILEDATA", or "ELECTRICITY"
            reference: `EFC-BILL-${Date.now()}`
        };

        const flwResponse = await fetch("https://api.flutterwave.com/v3/bills", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${FLW_SECRET_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const flwData = await flwResponse.json();

        console.log(`[BILL RESPONSE STATUS] HTTP ${flwResponse.status}`);
        console.log("[BILL RESPONSE DATA]", JSON.stringify(flwData, null, 2));

        if (flwResponse.ok && flwData.status === "success") {
            return res.json({ success: true, data: flwData.data });
        } else {
            const errorMsg = flwData.message || "Flutterwave transaction rejected";
            return res.status(flwResponse.status || 400).json({ success: false, error: errorMsg, details: flwData });
        }
    } catch (err) {
        console.error("[BILL EXCEPTION]", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// -------------------------------------------------------------
// 3. BANK PAYOUT / WITHDRAWAL ENDPOINT
// -------------------------------------------------------------
app.post("/api/merchant/payout-bank", async (req, res) => {
    try {
        const { accountBank, accountNumber, amount, narration } = req.body;

        console.log(`\n[PAYOUT REQUEST] Bank: ${accountBank} | Acc: ${accountNumber} | Amount: ${amount}`);

        if (!FLW_SECRET_KEY) {
            console.error("[PAYOUT ERROR] Secret Key is not configured on server.");
            return res.status(500).json({ success: false, error: "Server Configuration Error: Missing FLW_SECRET_KEY" });
        }

        const payload = {
            account_bank: String(accountBank).trim(),
            account_number: String(accountNumber).trim(),
            amount: Number(amount),
            currency: "NGN",
            narration: narration || "EFC Settlement Payout",
            reference: `EFC-PAYOUT-${Date.now()}`
        };

        const flwResponse = await fetch("https://api.flutterwave.com/v3/transfers", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${FLW_SECRET_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const flwData = await flwResponse.json();

        console.log(`[PAYOUT RESPONSE STATUS] HTTP ${flwResponse.status}`);
        console.log("[PAYOUT RESPONSE DATA]", JSON.stringify(flwData, null, 2));

        if (flwResponse.ok && flwData.status === "success") {
            return res.json({ success: true, data: flwData.data });
        } else {
            const errorMsg = flwData.message || "Payout transfer rejected";
            return res.status(flwResponse.status || 400).json({ success: false, error: errorMsg, details: flwData });
        }
    } catch (err) {
        console.error("[PAYOUT EXCEPTION]", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`EFC Pay Merchant Backend active on port ${PORT}`);
});
