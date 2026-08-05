// server.js - EFC Pay Global Production Server
require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;
const BSC_RPC = process.env.BSC_RPC || "https://bsc-dataseed.binance.org/";
const EFC_CONTRACT = "0x677Ce9CBa67f7484ea951a12897CE780cFd8fED1";

// Minimal ABI to listen for EFC Transfers
const EFC_ABI = ["event Transfer(address indexed from, address indexed to, uint256 value)"];

const provider = new ethers.providers.JsonRpcProvider(BSC_RPC);
const contract = new ethers.Contract(EFC_CONTRACT, EFC_ABI, provider);

console.log("🕊️ EFC Pay Global Server Starting...");

// -------------------------------------------------------------------
// 1. REAL-TIME ON-CHAIN EVENT LISTENER
// -------------------------------------------------------------------
contract.on("Transfer", async (from, to, value) => {
    try {
        const formattedAmt = ethers.utils.formatUnits(value, 18);
        console.log(`[ON-CHAIN EFC TX] ${formattedAmt} EFC | From: ${from} -> To: ${to}`);
        
        // AUTO-SETTLEMENT HOOK:
        // You can check if 'to' is a registered merchant address,
        // then automatically trigger payout via your Bank API here.
    } catch (err) {
        console.error("Error processing event:", err);
    }
});

// -------------------------------------------------------------------
// 2. BANK PAYOUT WEBHOOK ENDPOINT (e.g. Paystack / Monnify)
// -------------------------------------------------------------------
app.post('/api/bank-webhook', (req, res) => {
    const event = req.body;
    
    console.log("🏦 Incoming Bank Payment Event:", event);

    // Verify webhook signature here if using Paystack/Flutterwave
    if (event && event.event === 'charge.success') {
        const amountPaid = event.data.amount / 100; // e.g. NGN
        const customerEmail = event.data.customer.email;

        console.log(`✅ BANK DEPOSIT CONFIRMED: ₦${amountPaid} from ${customerEmail}`);
        // Action: Credit customer's EFC wallet balance on-chain or in database
    }

    res.sendStatus(200);
});

// -------------------------------------------------------------------
// 3. HEALTH CHECK & INVOICE API
// -------------------------------------------------------------------
app.get('/', (req, res) => {
    res.send("🕊️ EFC Pay Global Backend Engine Active");
});

app.post('/api/create-invoice', (req, res) => {
    const { merchantId, amount, currency } = req.body;
    const invoiceId = "INV-EFC-" + Date.now();
    
    res.json({
        success: true,
        invoiceId: invoiceId,
        merchant: merchantId,
        amount: amount,
        currency: currency || "NGN",
        status: "PENDING",
        createdAt: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 EFC Merchant Server live on port ${PORT}`);
});
          
