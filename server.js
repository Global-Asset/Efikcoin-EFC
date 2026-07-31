const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

// ==================== ENVIRONMENT CONFIGURATION ====================
const PORT = process.env.PORT || 3000;
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY; // Live secret key from Flutterwave Dashboard
const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH; // Webhook Secret Hash from Flutterwave Settings
const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/";

// Format private key safely
let rawKey = process.env.OPERATOR_PRIVATE_KEY || "";
if (rawKey && !rawKey.startsWith("0x")) {
    rawKey = "0x" + rawKey;
}

// Contract & Addresses
const EFC_CONTRACT_ADDRESS = "0x677ce9cba67f7484ea951a12897ce780cfd8fed1";
const EFC_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address recipient, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

// Web3 Initialization
const provider = new ethers.providers.JsonRpcProvider(BSC_RPC_URL);
let relayerWallet;
let efcContract;

try {
    if (rawKey && rawKey.length >= 64) {
        relayerWallet = new ethers.Wallet(rawKey, provider);
        efcContract = new ethers.Contract(EFC_CONTRACT_ADDRESS, EFC_ABI, relayerWallet);
        console.log("[WEB3 READY] Relayer Wallet Address:", relayerWallet.address);
    } else {
        console.warn("[WEB3 WARNING] OPERATOR_PRIVATE_KEY missing or invalid format.");
    }
} catch (e) {
    console.error("[WEB3 ERROR] Failed to load wallet:", e.message);
}

// ==================== ROUTE 1: FLUTTERWAVE BANK PAYOUT ====================
app.post('/api/merchant/payout-bank', async (req, res) => {
    try {
        const { accountBank, accountNumber, amount, narration, walletAddress } = req.body;

        if (!accountBank || !accountNumber || !amount) {
            return res.status(400).json({ success: false, error: "Missing required bank details or amount." });
        }

        const response = await axios.post(
            'https://api.flutterwave.com/v3/transfers',
            {
                account_bank: accountBank,
                account_number: accountNumber,
                amount: parseFloat(amount),
                narration: narration || "EFC Merchant Withdrawal",
                currency: "NGN",
                reference: `EFC_PAYOUT_${Date.now()}_${Math.floor(Math.random() * 1000)}`
            },
            {
                headers: {
                    'Authorization': `Bearer ${FLW_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return res.json({
            success: true,
            message: "Payout initiated successfully via Flutterwave.",
            data: response.data.data
        });

    } catch (error) {
        console.error("Flutterwave Payout Error:", error.response ? error.response.data : error.message);
        return res.status(500).json({
            success: false,
            error: error.response ? error.response.data.message : "Bank Payout execution failed."
        });
    }
});

// ==================== ROUTE 2: FLUTTERWAVE WEBHOOK (AUTOMATED EFC DISPATCH) ====================
app.post('/api/webhooks/flutterwave', async (req, res) => {
    try {
        const signature = req.headers['verif-hash'];
        if (!signature || signature !== FLW_SECRET_HASH) {
            return res.status(401).send("Unauthorized Webhook Signature.");
        }

        const payload = req.body;

        if (payload.status === 'successful' && payload.event === 'charge.completed') {
            const amountPaidNGN = payload.data.amount;
            const customerMeta = payload.data.meta || {};
            const userWalletAddress = customerMeta.walletAddress || payload.data.tx_ref;

            console.log(`[BANK DEPOSIT DETECTED] Amount: ${amountPaidNGN} NGN for Wallet: ${userWalletAddress}`);

            if (userWalletAddress && ethers.utils.isAddress(userWalletAddress) && efcContract) {
                const ratePerNGN = 0.01; 
                const efcToCredit = amountPaidNGN * ratePerNGN;
                const parsedEFC = ethers.utils.parseUnits(efcToCredit.toString(), 18);

                console.log(`[ON-CHAIN DISPATCH] Sending ${efcToCredit} EFC to ${userWalletAddress}...`);
                const tx = await efcContract.transfer(userWalletAddress, parsedEFC);
                await tx.wait();

                console.log(`[SUCCESS] EFC Token Transfer Confirmed! Tx Hash: ${tx.hash}`);
            }
        }

        return res.status(200).send("Webhook Processed Successfully");

    } catch (error) {
        console.error("Webhook Execution Error:", error.message);
        return res.status(500).send("Webhook Error processing transaction.");
    }
});

// ==================== ROUTE 3: PAY UTILITIES & BILLS (AIRTIME / DATA / ELECTRICITY) ====================
app.post('/api/merchant/pay-bill', async (req, res) => {
    try {
        const { customer, amount, type, country } = req.body;

        if (!customer || !amount) {
            return res.status(400).json({ success: false, error: "Missing customer account or bill amount." });
        }

        const response = await axios.post(
            'https://api.flutterwave.com/v3/bills',
            {
                country: country || "NG",
                customer: customer,
                amount: parseFloat(amount),
                type: type || "AIRTIME",
                reference: `EFC_BILL_${Date.now()}`
            },
            {
                headers: {
                    'Authorization': `Bearer ${FLW_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return res.json({
            success: true,
            message: "Utility payment executed successfully.",
            data: response.data.data
        });

    } catch (error) {
        console.error("Bill Payment Error:", error.response ? error.response.data : error.message);
        return res.status(500).json({
            success: false,
            error: error.response ? error.response.data.message : "Bill payment failed."
        });
    }
});

// ==================== ROUTE 4: BANK BUY (FIAT DIRECT PURCHASE) ====================
app.post('/api/merchant/bank-buy', async (req, res) => {
    try {
        const { amount, email, walletAddress } = req.body;

        if (!amount || !walletAddress) {
            return res.status(400).json({ success: false, error: "Missing purchase amount or wallet address." });
        }

        const response = await axios.post(
            'https://api.flutterwave.com/v3/payments',
            {
                tx_ref: `EFC_BUY_${walletAddress.substring(0,6)}_${Date.now()}`,
                amount: parseFloat(amount),
                currency: "NGN",
                redirect_url: "https://efcpay.efikcoin.xyz",
                customer: {
                    email: email || "customer@efikcoin.xyz"
                },
                meta: {
                    walletAddress: walletAddress
                },
                customizations: {
                    title: "Buy EFC Tokens",
                    description: "Direct Fiat to EFC Token Purchase"
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${FLW_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return res.json({
            success: true,
            payment_link: response.data.data.link
        });

    } catch (error) {
        console.error("Bank Buy Error:", error.response ? error.response.data : error.message);
        return res.status(500).json({
            success: false,
            error: error.response ? error.response.data.message : "Failed to generate bank payment link."
        });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`EFC Merchant Unified Server online on Render Port ${PORT}`);
});
