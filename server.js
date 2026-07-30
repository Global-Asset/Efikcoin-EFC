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

app.use(cors());
app.use(express.json());

const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
const provider = new ethers.JsonRpcProvider(BSC_RPC);
const processedTxHashes = new Set();

// Environment Variables Check
const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY || '';
const FLW_CLIENT_ID = process.env.FLW_CLIENT_ID || '';
const FLW_ENCRYPTION_KEY = process.env.FLW_ENCRYPTION_KEY || '';

function generateVTpassRequestId() {
    const now = new Date();
    const lagosOffset = 1 * 60;
    const localTime = new Date(now.getTime() + (lagosOffset + now.getTimezoneOffset()) * 60000);

    const year = localTime.getFullYear();
    const month = String(localTime.getMonth() + 1).padStart(2, '0');
    const day = String(localTime.getDate()).padStart(2, '0');
    const hours = String(localTime.getHours()).padStart(2, '0');
    const minutes = String(localTime.getMinutes()).padStart(2, '0');

    const datePrefix = `${year}${month}${day}${hours}${minutes}`;
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    return `${datePrefix}${randomSuffix}`;
}

app.get('/', (req, res) => {
    res.json({ status: "ONLINE", provider: "Flutterwave Client Auth & VTpass Integrated Backend" });
});

// 1. BILLS / UTILITIES (VTpass)
app.post('/api/merchant/pay-bill', async (req, res) => {
    try {
        const { txHash, serviceID, phone, amountFiat, variation_code } = req.body;

        if (!txHash || !serviceID || !phone || !amountFiat) {
            return res.status(400).json({ success: false, message: "Missing required parameters." });
        }

        if (processedTxHashes.has(txHash)) {
            return res.status(400).json({ success: false, message: "Transaction already processed." });
        }

        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
            return res.status(400).json({ success: false, message: "Unverified BSC transaction." });
        }

        processedTxHashes.add(txHash);

        const requestId = generateVTpassRequestId();
        const payload = {
            request_id: requestId,
            serviceID: serviceID.toLowerCase(),
            billersCode: phone,
            amount: amountFiat,
            phone: phone
        };

        if (variation_code) payload.variation_code = variation_code;

        const vtpassRes = await axios.post("https://vtpass.com/api/pay", payload, {
            headers: {
                'api-key': process.env.VTPASS_API_KEY || '',
                'secret-key': process.env.VTPASS_SECRET_KEY || '',
                'Content-Type': 'application/json'
            },
            timeout: 20000
        });

        if (vtpassRes.data && (vtpassRes.data.code === '000' || vtpassRes.data.code === '099')) {
            return res.json({ success: true, message: `Delivery Initiated! Request ID: ${requestId}`, data: vtpassRes.data });
        } else {
            return res.status(400).json({ success: false, message: `Provider Error: ${vtpassRes.data.response_description || 'Declined'}` });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: error.response?.data?.response_description || error.message });
    }
});

// 2. BANK TRANSFERS / PAYOUTS (Flutterwave)
app.post('/api/merchant/withdraw-to-bank', async (req, res) => {
    try {
        const { txHash, bankCode, accountNumber, amountFiat, beneficiaryName } = req.body;

        if (!txHash || !bankCode || !accountNumber || !amountFiat) {
            return res.status(400).json({ success: false, message: "Missing payout parameters." });
        }

        if (processedTxHashes.has(txHash)) {
            return res.status(400).json({ success: false, message: "Transaction already processed." });
        }

        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
            return res.status(400).json({ success: false, message: "Unverified BSC transaction." });
        }

        processedTxHashes.add(txHash);

        // Initiate transfer using Flutterwave Secret Key
        const flwRes = await axios.post("https://api.flutterwave.com/v3/transfers", {
            account_bank: bankCode,
            account_number: accountNumber,
            amount: Number(amountFiat),
            currency: "NGN",
            narration: "Efikcoin POS Settlement",
            reference: "EFC_FLW_" + Date.now(),
            beneficiary_name: beneficiaryName || "EFC Account"
        }, {
            headers: {
                'Authorization': `Bearer ${FLW_SECRET}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({ success: true, message: "Bank transfer processed!", data: flwRes.data });

    } catch (error) {
        console.error("Flutterwave Transfer Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: error.response?.data?.message || error.message });
    }
});

// 3. FLUTTERWAVE WEBHOOK
app.post('/api/merchant/webhook', (req, res) => {
    const signature = req.headers['verif-hash'];
    if (signature && signature === process.env.FLW_SECRET_HASH) {
        console.log("Flutterwave Webhook Payload:", req.body);
        return res.status(200).send("Webhook Received");
    }
    return res.status(401).send("Unauthorized Webhook Call");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
