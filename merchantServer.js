require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { ethers } = require('ethers');

const app = express();
app.use(express.json());

// 1. Setup Blockchain Provider (BNB Smart Chain)
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

// EFC Token Contract Interface
const EFC_CONTRACT_ADDRESS = "0x7FAbe1cc407f0e01c3cdF5Cc05744f8D98bC70B6";
const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// 2. Environment Configurations
const VTPASS_API_URL = "https://vtpass.com/api";
const FLUTTERWAVE_API_URL = "https://api.flutterwave.com/v3";

// --------------------------------------------------------------------------
// ROUTE 1: BUY AIRTIME/DATA WITH EFIKCOIN (EFC)
// --------------------------------------------------------------------------
app.post('/api/merchant/pay-bill', async (req, res) => {
    const { txHash, serviceID, phone, amountEFC, amountFiat, variationCode } = req.body;
    
    try {
        // Step A: Verify EFC payment on-chain
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
            return res.status(400).json({ success: false, message: "EFC payment transaction failed or pending." });
        }

        // Step B: Call VTPass API to recharge phone / pay bill
        const requestId = "EFC-RECHARGE-" + Date.now();
        const vtpassPayload = {
            request_id: requestId,
            serviceID: serviceID, // 'mtn', 'airtel', 'glo', 'ikedc', 'dstv'
            billersCode: phone,
            variation_code: variationCode, // optional for data bundles
            amount: amountFiat,
            phone: phone
        };

        const response = await axios.post(`${VTPASS_API_URL}/pay`, vtpassPayload, {
            headers: {
                'api-key': process.env.VTPASS_API_KEY,
                'secret-key': process.env.VTPASS_SECRET_KEY
            }
        });

        res.json({
            success: true,
            message: "EFC Payment Verified & Service Delivered!",
            data: response.data
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --------------------------------------------------------------------------
// ROUTE 2: TRANSFER MONEY TO ANY BANK (OFF-RAMP WITH EFC)
// --------------------------------------------------------------------------
app.post('/api/merchant/withdraw-to-bank', async (req, res) => {
    const { txHash, bankCode, accountNumber, amountFiat, accountName } = req.body;

    try {
        // Step A: Verify user sent EFC tokens to merchant treasury wallet
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
            return res.status(400).json({ success: false, message: "EFC transaction unverified." });
        }

        // Step B: Send Fiat directly to recipient bank account via Flutterwave
        const transferPayload = {
            account_bank: bankCode, // e.g., '058' for GTBank, '011' for FirstBank
            account_number: accountNumber,
            amount: amountFiat,
            narration: "Efikcoin Merchant Bank Payout",
            currency: "NGN",
            reference: "EFC-BANK-" + Date.now()
        };

        const flwResponse = await axios.post(`${FLUTTERWAVE_API_URL}/transfers`, transferPayload, {
            headers: {
                'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
            }
        });

        res.json({
            success: true,
            message: "Bank Transfer Successfully Processed!",
            transferDetails: flwResponse.data
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --------------------------------------------------------------------------
// ROUTE 3: RECEIVE MONEY VIA VIRTUAL BANK ACCOUNT (ON-RAMP)
// --------------------------------------------------------------------------
app.post('/api/merchant/create-deposit-account', async (req, res) => {
    const { userEmail, userPhone, userName } = req.body;

    try {
        // Generate a permanent virtual bank account for the user to deposit fiat
        const payload = {
            email: userEmail,
            is_permanent: true,
            bvn: process.env.MERCHANT_BVN, // or user's BVN/NIN for KYC
            tx_ref: "EFC-ACCOUNT-" + Date.now(),
            phonenumber: userPhone,
            firstname: userName
        };

        const response = await axios.post(`${FLUTTERWAVE_API_URL}/virtual-account-numbers`, payload, {
            headers: {
                'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
            }
        });

        res.json({
            success: true,
            accountDetails: response.data.data
            // Returns: { account_number: "9923842102", bank_name: "Wema Bank" }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Efikcoin Full Merchant Engine running on port ${PORT}`));
      
