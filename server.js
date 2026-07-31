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
const OPERATOR_PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY; // Treasury/Relayer wallet private key

// Contract & Addresses
const EFC_CONTRACT_ADDRESS = "0x677ce9cba67f7484ea951a12897ce780cfd8fed1";
const EFC_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address recipient, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

// Web3 Initialization
const provider = new ethers.providers.JsonRpcProvider(BSC_RPC_URL);
const relayerWallet = new ethers.Wallet(OPERATOR_PRIVATE_KEY, provider);
const efcContract = new ethers.Contract(EFC_CONTRACT_ADDRESS, EFC_ABI, relayerWallet);

// ==================== ROUTE 1: FLUTTERWAVE BANK PAYOUT ====================
// Initiates a real bank transfer from your Flutterwave account to a recipient bank
app.post('/api/merchant/payout-bank', async (req, res) => {
    try {
        const { accountBank, accountNumber, amount, narration, walletAddress } = req.body;

        if (!accountBank || !accountNumber || !amount || !walletAddress) {
            return res.status(400).json({ success: false, error: "Missing required payout parameters." });
        }

        // Call Flutterwave v3 Transfer API
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
// Listens for automated bank transfers paid by users and credits their Web3 address with EFC
app.post('/api/webhooks/flutterwave', async (req, res) => {
    try {
        // Verify Webhook Signature Hash
        const signature = req.headers['verif-hash'];
        if (!signature || signature !== FLW_SECRET_HASH) {
            return res.status(401).send("Unauthorized Webhook Signature.");
        }

        const payload = req.body;

        // Check if transaction is successful
        if (payload.status === 'successful' && payload.event === 'charge.completed') {
            const amountPaidNGN = payload.data.amount;
            const customerMeta = payload.data.meta || {};
            const userWalletAddress = customerMeta.walletAddress || payload.data.tx_ref;

            console.log(`[BANK DEPOSIT DETECTED] Amount: ${amountPaidNGN} NGN for Wallet: ${userWalletAddress}`);

            if (userWalletAddress && ethers.utils.isAddress(userWalletAddress)) {
                // Calculate EFC Token Conversion Rate (e.g., 100 NGN = 1 EFC)
                const ratePerNGN = 0.01; 
                const efcToCredit = amountPaidNGN * ratePerNGN;
                const parsedEFC = ethers.utils.parseUnits(efcToCredit.toString(), 18);

                // Dispatch EFC Tokens directly on-chain from Relayer Wallet
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

// Start Render Backend
app.listen(PORT, () => {
    console.log(`EFC Merchant Server online on Render Port ${PORT}`);
});
