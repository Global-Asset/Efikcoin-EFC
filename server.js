// Safely load dotenv if available, otherwise rely on Render environment variables
try {
    require('dotenv').config();
} catch (e) {
    console.log("Running without local .env file");
}

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { ethers } = require('ethers');

const app = express();

// Enable CORS for frontend requests
app.use(cors());
app.use(express.json());

// BSC RPC Provider Setup
const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
const provider = new ethers.JsonRpcProvider(BSC_RPC);

// Memory store to block double transactions
const processedTxHashes = new Set();

// Health Check Endpoint (Render checks this)
app.get('/', (req, res) => {
    res.json({ status: "ONLINE", service: "Efikcoin Merchant Backend", timestamp: new Date() });
});

// 1. RECHARGE & UTILITY ENDPOINT
app.post('/api/merchant/pay-bill', async (req, res) => {
    try {
        const { txHash, serviceID, phone, amountFiat } = req.body;

        if (!txHash || !serviceID || !phone || !amountFiat) {
            return res.status(400).json({ success: false, message: "Missing bill parameters." });
        }

        if (processedTxHashes.has(txHash)) {
            return res.status(400).json({ success: false, message: "Transaction hash already processed." });
        }

        // Verify transaction on BSC
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
            return res.status(400).json({ success: false, message: "BSC Transaction unverified or failed." });
        }

        processedTxHashes.add(txHash);

        // Call Utility API (Using live/sandbox endpoint)
        const vtpassRes = await axios.post("https://vtpass.com/api/pay", {
            request_id: "EFC_" + Date.now(),
            serviceID: serviceID,
            billersCode: phone,
            amount: amountFiat,
            phone: phone
        }, {
            headers: {
                'api-key': process.env.VTPASS_API_KEY || '',
                'secret-key': process.env.VTPASS_SECRET_KEY || ''
            },
            timeout: 15000
        });

        res.json({ success: true, message: "Payment processed!", data: vtpassRes.data });

    } catch (error) {
        console.error("Bill Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. BANK PAYOUT ENDPOINT
app.post('/api/merchant/withdraw-to-bank', async (req, res) => {
    try {
        const { txHash, bankCode, accountNumber, amountFiat } = req.body;

        if (!txHash || !bankCode || !accountNumber || !amountFiat) {
            return res.status(400).json({ success: false, message: "Missing payout parameters." });
        }

        if (processedTxHashes.has(txHash)) {
            return res.status(400).json({ success: false, message: "Transaction already processed." });
        }

        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
            return res.status(400).json({ success: false, message: "BSC Transaction unverified." });
        }

        processedTxHashes.add(txHash);

        // Flutterwave payout call
        const flwRes = await axios.post("https://api.flutterwave.com/v3/transfers", {
            account_bank: bankCode,
            account_number: accountNumber,
            amount: amountFiat,
            currency: "NGN",
            narration: "Efikcoin Merchant Payout",
            reference: "EFC_PAYOUT_" + Date.now()
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY || ''}`
            },
            timeout: 15000
        });

        res.json({ success: true, message: "Bank transfer initiated!", data: flwRes.data });

    } catch (error) {
        console.error("Payout Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// BIND TO 0.0.0.0 AND RENDER'S DYNAMIC PORT
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server successfully listening on port ${PORT}`);
});
