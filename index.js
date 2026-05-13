const express = require("express")
const dotenv = require("dotenv")
const path = require("path")  // ← একবারই যথেষ্ট

dotenv.config()

const app = express()
app.use(express.json())

const {
  TonClient,
  WalletContractV4,
  internal,
  toNano,
  Address,
  JettonMaster,
  JettonWallet
} = require("@ton/ton")

const {
  mnemonicToPrivateKey
} = require("@ton/crypto")

const {
  getHttpEndpoint
} = require("@orbs-network/ton-access")

// ==================== ROUTES ====================

// Root
app.get("/", (req, res) => {
  res.send("TON WITHDRAW API WORKING")
})

// TON Withdraw Route
app.post("/ton/send", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"]
    if (apiKey !== process.env.API_KEY) {
      return res.json({ success: false, error: "Invalid API key" })
    }

    const walletAddress = req.body.wallet
    const amount = parseFloat(req.body.amount)

    if (!walletAddress) {
      return res.json({ success: false, error: "Wallet address missing" })
    }
    if (!amount || amount <= 0) {
      return res.json({ success: false, error: "Invalid amount" })
    }

    const endpoint = await getHttpEndpoint()
    const client = new TonClient({ endpoint })

    const mnemonic = process.env.MNEMONIC.split(" ")
    const keyPair = await mnemonicToPrivateKey(mnemonic)

    const wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: keyPair.publicKey
    })

    const contract = client.open(wallet)
    const balance = await contract.getBalance()

    console.log("WALLET:", wallet.address.toString())
    console.log("BALANCE RAW:", balance.toString())
    console.log("BALANCE TON:", Number(balance) / 1e9)
    console.log("SEND:", amount)

    const sendAmount = toNano(amount.toString())
    const gasReserve = toNano("0.01")
    const required = BigInt(sendAmount) + BigInt(gasReserve)

    console.log("REQUIRED:", Number(required) / 1e9)

    if (BigInt(balance) < required) {
      return res.json({ success: false, error: "Insufficient wallet balance" })
    }

    const seqno = await contract.getSeqno()

    await contract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: walletAddress,
          value: sendAmount,
          body: "TON Withdraw"
        })
      ]
    })

    await new Promise(r => setTimeout(r, 5000))

    const walletAddr = wallet.address.toString()
    const explorerLink = "https://tonviewer.com/" + walletAddr

    return res.json({ success: true, tx_hash: explorerLink })

  } catch (e) {
    return res.json({ success: false, error: e.message })
  }
})

// USDT TON Withdraw Route
app.post("/usdt/send", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"]
    if (apiKey !== process.env.API_KEY) {
      return res.json({ success: false, error: "Invalid API key" })
    }

    const walletAddress = req.body.wallet
    const amount = parseFloat(req.body.amount)

    if (!walletAddress) {
      return res.json({ success: false, error: "Wallet missing" })
    }
    if (!amount || amount <= 0) {
      return res.json({ success: false, error: "Invalid amount" })
    }

    const endpoint = await getHttpEndpoint()
    const client = new TonClient({ endpoint })

    const mnemonic = process.env.MNEMONIC.split(" ")
    const keyPair = await mnemonicToPrivateKey(mnemonic)

    const wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: keyPair.publicKey
    })

    const contract = client.open(wallet)

    // USDT Master Contract Address (replace with real one)
    const USDT_MASTER = Address.parse("EQCxE6mUtQJKFnf...")

    const master = client.open(JettonMaster.create(USDT_MASTER))
    const jettonWalletAddress = await master.getWalletAddress(wallet.address)

    const jettonWallet = client.open(JettonWallet.create(jettonWalletAddress))

    await jettonWallet.sendTransfer(
      contract.sender(keyPair.secretKey),
      toNano("0.05"),
      {
        amount: BigInt(Math.floor(amount * 1000000)),
        destination: Address.parse(walletAddress),
        responseAddress: wallet.address
      }
    )

    return res.json({ success: true, message: "USDT Sent" })

  } catch (e) {
    return res.json({ success: false, error: e.message })
  }
})

// ==================== DOCS ROUTES ====================

// Route 1: /docs → docs.html
app.get("/docs", (req, res) => {
  res.sendFile(path.join(__dirname, "docs.html"))
})

// Route 2: /doc → doc.html (new test route)
app.get("/doc", (req, res) => {
  res.sendFile(path.join(__dirname, "doc.html"))
})

// ==================== SERVER ====================

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("TON API STARTED on port", PORT)
})