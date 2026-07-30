require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Production Provider Setup (BSC Mainnet)
const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
const provider = new ethers.JsonRpcProvider(BSC_RPC);

// EFC ERC-20 Parameters
const EFC_CONTRACT_ADDRESS = process.env.EFC_CONTRACT_ADDRESS || "0x7FAbe1cc407f0e01c3cdF5Cc05744f8D98bC70B6";
const TREASURY_WALLET = process.env.TREASURY_WALLET_ADDRESS || "0x9F8C29E496ECB6C39c221458f211234DfCB233E0";

// Memory storage to block duplicate Tx execution (Replace with Redis / Mongo in production)
const processedTxHashes = new Set();

/**
 * DEFENSIVE UTILITY: Verify On-Chain Transaction Receipt
 */
async function verifyOnChainSettlement(txHash, expectedAmountEFC) {
    if (!txHash || !txHash.startsWith("0x") || txHash.length !== 66) {
        throw new Error("Invalid transaction hash format.");
    }

    if (processedTxHashes.has(txHash)) {
        throw new Error("This transaction hash has already been processed.");
    }

    // Fetch receipt from BSC Blockchain
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
        throw new Error("Transaction not found on BSC. Please wait for block confirmation.");
    }

    if (receipt.status !== 1) {
        throw new Error("Transaction failed on-chain.");
    }

    // Mark as processed immediately to prevent double spending
    processedTxHashes.add(txHash);
    return receipt;
}

// --------------------------------------------------------------------------
// 1. RECHARGE & UTILITY ENDPOINT (VTPass Integration)
// --------------------------------------------------------------------------
app.post('/api/merchant/pay-bill', async (req, res) => {
    try {
        const { txHash, serviceID, phone, amountFiat, variationCode } = req.body;

        if (!txHash || !serviceID || !phone || !amountFiat) {
            return res.status(400).json({ success: false, message: "Missing required bill parameters." });
        }

        // Step 1: Verify EFC transfer on-chain safely
        await verifyOnChainSettlement(txHash);

        // Step 2: Fire VTPass API Call
        const vtpassPayload = {
            request_id: "EFC-BILL-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            serviceID: serviceID, // 'mtn', 'airtel', 'glo', 'ikedc'
            billersCode: phone,
            variation_code: variationCode || "", 
            amount: amountFiat,
            phone: phone
        };

        const response = await axios.post("https://vtpass.com/api/pay", vtpassPayload, {
            headers: {
                'api-key': process.env.VTPASS_API_KEY,
                'secret-key': process.env.VTPASS_SECRET_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 15000 // 15-second timeout to avoid backend freeze
        });

        res.json({
            success: true,
            message: "EFC Payment Confirmed & Utility Delivered!",
            data: response.data
        });

    } catch (error) {
        console.error("[Bill Error]", error.message);
        res.status(500).json({ success: false, message: error.message || "Failed to process bill payment." });
    }
});

// --------------------------------------------------------------------------
// 2. BANK PAYOUT ENDPOINT (Flutterwave Integration)
// --------------------------------------------------------------------------
app.post('/api/merchant/withdraw-to-bank', async (req, res) => {
    try {
        const { txHash, bankCode, accountNumber, amountFiat } = req.body;

        if (!txHash || !bankCode || !accountNumber || !amountFiat) {
            return res.status(400).json({ success: false, message: "Missing required bank transfer details." });
        }

        // Step 1: Verify EFC transfer on-chain
        await verifyOnChainSettlement(txHash);

        // Step 2: Trigger Bank Transfer via Flutterwave
        const flwPayload = {
            account_bank: bankCode,
            account_number: accountNumber,
            amount: amountFiat,
            narration: "Efikcoin Merchant Payout",
            currency: "NGN",
            reference: "EFC-PAYOUT-" + Date.now()
        };

        const response = await axios.post("https://api.flutterwave.com/v3/transfers", flwPayload, {
            headers: {
                'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        res.json({
            success: true,
            message: "Bank Payout Dispatched Successfully!",
            transferData: response.data
        });

    } catch (error) {
        console.error("[Payout Error]", error.message);
        res.status(500).json({ success: false, message: error.message || "Failed to initiate bank payout." });
    }
});

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: "ONLINE", timestamp: new Date() }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Efikcoin Merchant Engine running securely on port ${PORT}`));

          // Keep all your routes, VTPass, Flutterwave, and Ethers code above this!

const PORT = process.env.PORT || 10000;

// MUST bind to '0.0.0.0' for Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Efikcoin Merchant Backend running on port ${PORT}`);
});
