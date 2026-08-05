const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;
const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH;

const userVaults = {};

// 1. REGISTER CLIENT
app.post("/api/merchant/register-client", async (req, res) => {
    const { email, firstname, lastname, phonenumber, bvn } = req.body;

    if (!email || !firstname || !lastname) {
        return res.status(400).json({ success: false, error: "Missing required fields." });
    }

    try {
        const response = await fetch("https://api.flutterwave.com/v3/virtual-account-numbers", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${FLW_SECRET_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                is_permanent: true,
                bvn: bvn || undefined,
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

            if (!userVaults[email]) {
                userVaults[email] = {
                    name: `${firstname} ${lastname}`,
                    email: email,
                    accountNumber: accNum,
                    bankName: bankName,
                    fiatBalance: 0
                };
            }

            return res.json({ success: true, account_number: accNum, bank_name: bankName });
        } else {
            return res.status(400).json({ success: false, error: flwData.message });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 2. WEBHOOK RECEIVER
app.post("/api/webhooks/flutterwave", (req, res) => {
    const signature = req.headers["verif-hash"];

    if (!signature || signature !== FLW_SECRET_HASH) {
        return res.status(401).send("Unauthorized");
    }

    const payload = req.body;

    if (payload.event === "charge.completed" && payload.data.status === "successful") {
        const customerEmail = payload.data.customer ? payload.data.customer.email : null;
        const amountDeposited = payload.data.amount;

        if (customerEmail) {
            if (!userVaults[customerEmail]) {
                userVaults[customerEmail] = { email: customerEmail, fiatBalance: 0 };
            }
            userVaults[customerEmail].fiatBalance += amountDeposited;
        }
    }

    res.status(200).send("Webhook Processed");
});

// 3. FIAT BALANCE
app.get("/api/merchant/fiat-balance", (req, res) => {
    const email = req.query.email;
    if (email && userVaults[email]) {
        return res.json({ success: true, balance: userVaults[email].fiatBalance });
    }
    return res.json({ success: true, balance: 0 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EFC Core Server active on port ${PORT}`));
