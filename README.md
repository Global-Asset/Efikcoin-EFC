[![Run in Postman](https://run.pstmn.io/button.svg)](https://god.gw.postman.com/run-collection/56887199-9ed44332-83a5-4190-8b0b-977a6b67d678?action=collection%2Ffork&source=rip_markdown&collection-url=entityId%3D56887199-9ed44332-83a5-4190-8b0b-977a6b67d678%26entityType%3Dcollection%26workspaceId%3D1fafbe86-7048-4606-8b00-634e2a059558)
# 🚀 EFC Pay - Mainnet Financial & Merchant Ecosystem

EFC Pay is a self-custodial Web3 merchant application and multi-asset portal built for the **BNB Smart Chain (BSC) Mainnet**. It enables direct $EFC$ token transfers, live RPC multi-node failover balance reads, bank fiat-to-crypto purchasing routes, bill/utility payments, and on-chain $EFC$ staking yield interactions.

---

## 🔗 Mainnet Contract Directory

| Resource / Contract | Network | On-Chain Address |
| :--- | :--- | :--- |
| **EFIKCOIN Token (EFC)** | BSC Mainnet (BEP-20) | `0x677Ce9CBa67f7484ea951a12897CE780cFd8fED1` |
| **Pancakeswap LP Pair (EFC/BNB)** | BSC Mainnet (V2) | `0xa1DD6C528882Dc19EcCbC967F50bBC121A29630e` |
| **EFC Treasury Address** | BSC Mainnet | `0x676cCf34C191a9D6EFE4B265b84877C619A559d0` |
| **USDT Stablecoin** | BSC Mainnet (BEP-20) | `0x55d398326f99059fF775485246999027B3197955` |
| **USDC Stablecoin** | BSC Mainnet (BEP-20) | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |

---

## 🛠 Embedded Application Architecture

The ecosystem relies on three client-side core files for local Web3 execution and PWA installation:

1. **`index.html`** – Full Web3 UI, Ethers.js multi-node provider failover, PIN-based wallet encryption, and ABI transaction builders.
2. **`manifest.json`** – PWA manifest providing native mobile installation support.
3. **`sw.js`** – Service worker enabling offline resource caching and app lifecycle management.

```text
├── index.html        # Mainnet Web3 UI and client application
├── manifest.json     # PWA app launcher metadata
├── sw.js             # Offline service worker script
└── README.md         # Ecosystem documentation
const RPC_NODES = [
    "[https://bsc-dataseed.binance.org/](https://bsc-dataseed.binance.org/)",
    "[https://bsc-dataseed1.defibit.io/](https://bsc-dataseed1.defibit.io/)",
    "[https://rpc.ankr.com/bsc](https://rpc.ankr.com/bsc)"
"https://bsc-dataseed.bnbchain.org"
];
