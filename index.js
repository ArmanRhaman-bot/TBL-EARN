const express = require("express")
const dotenv = require("dotenv")

dotenv.config()

const app = express()
app.use(express.json())

// ================== MEMORY DATABASE ==================
let users = {}   // userId ভিত্তিক balance
let apiKeys = {} // apiKey ভিত্তিক userId

// ================== TON ==================
const {
  TonClient,
  WalletContractV4,
  internal,
  toNano,
  Address
} = require("@ton/ton")

const { mnemonicToPrivateKey } = require("@ton/crypto")
const { getHttpEndpoint } = require("@orbs-network/ton-access")

// ================== ROOT ==================
app.get("/", (req, res) => {
  res.send("TON API RUNNING (NO DB)")
})

// ================== CREATE API KEY ==================
app.post("/create", (req, res) => {
  const userId = req.body.user_id

  if (!userId) {
    return res.json({ success: false, error: "user_id required" })
  }

  const apiKey = Math.random().toString(36).substring(2, 15)

  apiKeys[apiKey] = userId

  users[userId] = users[userId] || { balance: 0 }

  return res.json({
    success: true,
    api_key: apiKey
  })
})

// ================== ADD BALANCE ==================
app.post("/add", (req, res) => {
  const userId = req.body.user_id
  const amount = parseFloat(req.body.amount)

  if (!userId || !amount) {
    return res.json({ success: false })
  }

  users[userId] = users[userId] || { balance: 0 }
  users[userId].balance += amount

  return res.json({
    success: true,
    balance: users[userId].balance
  })
})

// ================== CHECK BALANCE ==================
app.post("/balance", (req, res) => {
  const apiKey = req.headers["x-api-key"]

  const userId = apiKeys[apiKey]

  if (!userId) {
    return res.json({ success: false, error: "Invalid API key" })
  }

  return res.json({
    success: true,
    balance: users[userId].balance
  })
})

// ================== WITHDRAW TON ==================
app.post("/ton/send", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"]
    const userId = apiKeys[apiKey]

    if (!userId) {
      return res.json({ success: false, error: "Invalid API key" })
    }

    const walletAddress = req.body.wallet
    const amount = parseFloat(req.body.amount)

    if (!walletAddress || !amount) {
      return res.json({ success: false, error: "Invalid input" })
    }

    // Check balance
    if (users[userId].balance < amount) {
      return res.json({ success: false, error: "Not enough balance" })
    }

    // TON SEND
    const endpoint = await getHttpEndpoint()
    const client = new TonClient({ endpoint })

    const mnemonic = process.env.MNEMONIC.split(" ")
    const keyPair = await mnemonicToPrivateKey(mnemonic)

    const wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: keyPair.publicKey
    })

    const contract = client.open(wallet)

    const sendAmount = toNano(amount.toString())

    const seqno = await contract.getSeqno()

    await contract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: walletAddress,
          value: sendAmount,
          body: "Withdraw"
        })
      ]
    })

    // deduct balance
    users[userId].balance -= amount

    return res.json({
      success: true,
      balance: users[userId].balance
    })

  } catch (e) {
    return res.json({ success: false, error: e.message })
  }
})

// ================== SERVER ==================
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("API STARTED:", PORT)
})