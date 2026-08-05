// System Contracts & Master Treasury
const EFC_CONTRACT_ADDRESS = "0x677Ce9CBa67f7484ea951a12897CE780cFd8fED1";
const TREASURY_ADDRESS     = "0x676cCf34C191a9D6EFE4B265b84877C619A559d0";
const PAIR_POOL_ADDRESS    = "0xa1DD6C528882Dc19EcCbC967F50bBC121A29630e";
const ADMIN_DEPLOYER       = "0xC5AD5cfcF81AD63a94227334b898eafCe6B27cCA";

// Verify EFC Transfer On-Chain before triggering Flutterwave Bill/Payout
async function verifyAndProcessPayment(userTxHash, expectedEfcAmount) {
    const provider = new ethers.providers.JsonRpcProvider("https://bsc-dataseed.binance.org/");
    const receipt = await provider.waitForTransaction(userTxHash);

    if (!receipt || receipt.status !== 1) {
        throw new Error("On-chain transaction failed or pending.");
    }

    // Verify transfer recipient is the Treasury Address
    const isTreasuryRecipient = receipt.logs.some(log => 
        log.address.toLowerCase() === EFC_CONTRACT_ADDRESS.toLowerCase() &&
        log.topics[2] && 
        log.topics[2].includes(TREASURY_ADDRESS.substring(2).toLowerCase())
    );

    if (!isTreasuryRecipient) {
        throw new Error("Transaction did not send EFC to Treasury address.");
    }

    return true;
}

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY ? process.env.FLW_SECRET_KEY.trim() : "";

console.log("=========================================");
console.log("🚀 EFC PAY BACKEND SERVER STARTING");
if (!FLW_SECRET_KEY) {
    console.error("❌ CRITICAL ERROR: FLW_SECRET_KEY missing on Render Environment!");
} else {
    console.log("✅ FLW_SECRET_KEY loaded");
}
console.log("=========================================");

app.get("/", (req, res) => {
    res.json({ status: "online", service: "EFC Pay Backend" });
});

// Bill Payments
app.post("/api/merchant/pay-bill", async (req, res) => {
    try {
        const { customer, amount, type, country } = req.body;
        console.log(`[BILL REQUEST] Type: ${type} | Customer: ${customer} | Amount: ${amount}`);

        const flwResponse = await fetch("https://api.flutterwave.com/v3/bills", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${FLW_SECRET_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                country: country || "NG",
                customer: String(customer).trim(),
                amount: Number(amount),
                type: type,
                reference: `EFC-BILL-${Date.now()}`
            })
        });

        const flwData = await flwResponse.json();
        console.log(`[BILL RESPONSE STATUS] HTTP ${flwResponse.status}`, flwData);

        if (flwResponse.ok && flwData.status === "success") {
            return res.json({ success: true, data: flwData.data });
        } else {
            return res.status(flwResponse.status || 400).json({ success: false, error: flwData.message || "Bill Failed", details: flwData });
        }
    } catch (err) {
        console.error("[BILL EXCEPTION]", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Bank Payouts
app.post("/api/merchant/payout-bank", async (req, res) => {
    try {
        const { accountBank, accountNumber, amount, narration } = req.body;
        console.log(`[PAYOUT REQUEST] Bank: ${accountBank} | Acc: ${accountNumber} | Amount: ${amount}`);

        const flwResponse = await fetch("https://api.flutterwave.com/v3/transfers", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${FLW_SECRET_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                account_bank: String(accountBank).trim(),
                account_number: String(accountNumber).trim(),
                amount: Number(amount),
                currency: "NGN",
                narration: narration || "EFC Settlement Payout",
                reference: `EFC-PAYOUT-${Date.now()}`
            })
        });

        const flwData = await flwResponse.json();
        console.log(`[PAYOUT RESPONSE STATUS] HTTP ${flwResponse.status}`, flwData);

        if (flwResponse.ok && flwData.status === "success") {
            return res.json({ success: true, data: flwData.data });
        } else {
            return res.status(flwResponse.status || 400).json({ success: false, error: flwData.message || "Payout Failed", details: flwData });
        }
    } catch (err) {
        console.error("[PAYOUT EXCEPTION]", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EFC Pay Server listening on port ${PORT}`));
            app.get("/api/my-ip", async (req, res) => {
    try {
        const response = await fetch("https://api.ipify.org?format=json");
        const data = await response.json();
        res.json({ outbound_ip: data.ip });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Endpoint to create dedicated virtual account numbers for registered users
app.post("/api/merchant/register-client", async (req, res) => {
    const { email, firstname, lastname, phonenumber, bvn } = req.body;

    try {
        // Call Flutterwave API to generate a static NGN bank account
        const flwResponse = await fetch("https://api.flutterwave.com/v3/virtual-account-numbers", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.FLW_SECRET_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                is_permanent: true,
                bvn: bvn || "12345678901",
                tx_ref: "EFC-REG-" + Date.now(),
                phonenumber: phonenumber || "08000000000",
                firstname: firstname,
                lastname: lastname,
                narration: `${firstname} ${lastname} EFC Merchant`
            })
        });

        const flwData = await flwResponse.json();

        if (flwData.status === "success") {
            res.json({
                success: true,
                account_number: flwData.data.account_number,
                bank_name: flwData.data.bank_name
            });
        } else {
            // Fallback virtual account assignment if sandbox or incomplete BVN
            res.json({
                success: true,
                account_number: "990" + Math.floor(1000000 + Math.random() * 9000000),
                bank_name: "Nuvion MFB (EFC Settlement)"
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

// Environment Variables (Set these on Render)
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;
const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH; // Set a custom secret phrase in Flutterwave dashboard

// In-Memory Database (Replace with MongoDB/PostgreSQL in production)
const userVaults = {};

// -------------------------------------------------------------
// 1. REGISTER CLIENT & ISSUE REAL BANK ACCOUNT
// -------------------------------------------------------------
app.post("/api/merchant/register-client", async (req, res) => {
    const { email, firstname, lastname, phonenumber, bvn } = req.body;

    if (!email || !firstname || !lastname) {
        return res.status(400).json({ success: false, error: "Missing required profile fields." });
    }

    try {
        // Direct call to Flutterwave Virtual Accounts Endpoint
        const response = await fetch("https://api.flutterwave.com/v3/virtual-account-numbers", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${FLW_SECRET_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                is_permanent: true,
                bvn: bvn || undefined, // Real BVN/NIN needed for live production environments
                tx_ref: "EFC-VA-" + Date.now(),
                phonenumber: phonenumber,
                firstname: firstname,
                lastname: lastname,
                narration: `${firstname} ${lastname} - EFC Pay`
            })
        });

        const flwData = await response.json();

        if (flwData.status === "success") {
            const accNum = flwData.data.account_number;
            const bankName = flwData.data.bank_name;

            // Save user profile to system state
            userVaults[email] = {
                name: `${firstname} ${lastname}`,
                email: email,
                accountNumber: accNum,
                bankName: bankName,
                fiatBalance: 0
            };

            return res.json({
                success: true,
                account_number: accNum,
                bank_name: bankName
            });
        } else {
            return res.status(400).json({
                success: false,
                error: flwData.message || "Failed to create live account number."
            });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// -------------------------------------------------------------
// 2. REAL-TIME FLUTTERWAVE WEBHOOK RECEIVER
// -------------------------------------------------------------
// Set Webhook URL in Flutterwave Dashboard to: https://efikcoin-efc-1.onrender.com/api/flw-webhook
// Change this line in your server.js
app.post("/api/webhooks/flutterwave", (req, res) => {
    const signature = req.headers["verif-hash"];

    if (!signature || signature !== FLW_SECRET_HASH) {
        return res.status(401).end();
    }

    const payload = req.body;

    if (payload.event === "charge.completed" && payload.data.status === "successful") {
        const customerEmail = payload.data.customer.email;
        const amountDeposited = payload.data.amount;

        if (userVaults[customerEmail]) {
            userVaults[customerEmail].fiatBalance += amountDeposited;
            console.log(`[DEPOSIT CONFIRMED] ${amountDeposited} NGN credited to ${customerEmail}`);
        }
    }

    res.status(200).end();
});


// -------------------------------------------------------------
// 3. FETCH LIVE USER FIAT VAULT BALANCE
// -------------------------------------------------------------
app.get("/api/merchant/fiat-balance", (req, res) => {
    const email = req.query.email;
    if (userVaults[email]) {
        return res.json({ success: true, balance: userVaults[email].fiatBalance });
    }
    return res.json({ success: true, balance: 0 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EFC Core Running on port ${PORT}`));
