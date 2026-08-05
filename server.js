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
