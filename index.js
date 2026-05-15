const express = require("express")
const dotenv = require("dotenv")
const path = require("path")
dotenv.config()

const app = express()
app.use(express.json())

// ================== IN-MEMORY DATABASE ==================
let users = {}      // userId => { balance, apiKey, depositAddress, pendingDeposits }
let apiKeys = {}    // apiKey => userId
let depositMap = {} // depositMemo => userId (TON comment)

// ================== TON IMPORTS ==================
const {
  TonClient,
  WalletContractV4,
  internal,
  toNano,
  fromNano,
  Address
} = require("@ton/ton")

const { mnemonicToPrivateKey } = require("@ton/crypto")
const { getHttpEndpoint } = require("@orbs-network/ton-access")

// ================== HELPERS ==================

function generateApiKey() {
  return "tbl_" + Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10)
}

function generateMemo() {
  return "DEP" + Math.floor(Math.random() * 9000000 + 1000000)
}

async function getTonClient() {
  const endpoint = await getHttpEndpoint({ network: "mainnet" })
  return new TonClient({ endpoint })
}

async function getMasterWallet(client) {
  const mnemonic = process.env.MNEMONIC.split(" ")
  const keyPair = await mnemonicToPrivateKey(mnemonic)
  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: keyPair.publicKey
  })
  return { wallet, keyPair, contract: client.open(wallet) }
}

// ================== ROOT ==================
app.get("/", (req, res) => {
  res.json({
    name: "SAFEORA - TON Payment Gateway API",
    version: "2.0.0",
    endpoints: {
      "POST /api/register":      "New user registration + will receive API key",
      "GET  /api/deposit/info":  "Create a deposit address)",
      "POST /api/deposit/verify":"Deposit Verify",
      "GET  /api/balance":       "Balance Check",
      "POST /api/withdraw":      "Withdraw Coins"
    }
  })
})

// ================== REGISTER ==================
// New user registration — will receive API key
app.post("/api/register", (req, res) => {
  const { user_id } = req.body

  if (!user_id) {
    return res.status(400).json({ success: false, error: "user_id Required" })
  }

  // Return the same key if it already exists.
  if (users[user_id]) {
    return res.json({
      success: true,
      message: "Already registered",
      api_key: users[user_id].apiKey,
      balance: users[user_id].balance
    })
  }

  const apiKey = generateApiKey()
  const memo   = generateMemo()

  users[user_id] = {
    balance: 0,
    apiKey,
    memo,             // This memo must be commented at the time of deposit.
    transactions: []
  }

  apiKeys[apiKey]   = user_id
  depositMap[memo]  = user_id

  return res.status(201).json({
    success: true,
    message: "Registration successful.",
    api_key: apiKey,
    balance: 0,
    deposit_info: {
      address: process.env.MASTER_WALLET_ADDRESS || "Enter your master wallet address.",
      memo,
      note: "When sending TON, write this code in the comment/memo"
    }
  })
})

// ================== DEPOSIT INFO ==================
// The user will know his deposit address and memo.
app.get("/api/deposit/info", (req, res) => {
  const apiKey = req.headers["x-api-key"]
  const userId = apiKeys[apiKey]

  if (!userId) {
    return res.status(401).json({ success: false, error: "Invalid API key" })
  }

  return res.json({
    success: true,
    deposit_address: process.env.MASTER_WALLET_ADDRESS,
    memo: users[userId].memo,
    current_balance: users[userId].balance,
    instruction: `Send TON to this address. Write in Comment/Memo: ${users[userId].memo}`
  })
})

// ================== DEPOSIT VERIFY ==================
// TON will update the balance by checking transactions from the blockchain.
app.post("/api/deposit/verify", async (req, res) => {
  const apiKey = req.headers["x-api-key"]
  const userId = apiKeys[apiKey]

  if (!userId) {
    return res.status(401).json({ success: false, error: "Invalid API key" })
  }

  try {
    const client   = await getTonClient()
    const { wallet, contract } = await getMasterWallet(client)

    // Check last 10 transactions
    const txs = await client.getTransactions(wallet.address, { limit: 20 })

    const userMemo = users[userId].memo
    let found      = false
    let totalAdded = 0

    for (const tx of txs) {
      // Only incoming transactions
      if (!tx.inMessage) continue

      const body = tx.inMessage.body
      let comment = ""

      try {
        // text comment পড়ার চেষ্টা
        const slice = body.beginParse()
        const op    = slice.loadUint(32)
        if (op === 0) {
          comment = slice.loadStringTail()
        }
      } catch (_) { continue }

      if (comment.trim() !== userMemo) continue

      // Check if the transaction has been processed before
      const txHash = tx.hash().toString("hex")

      const alreadyProcessed = users[userId].transactions
        .some(t => t.hash === txHash)

      if (alreadyProcessed) continue

      const amount = parseFloat(fromNano(tx.inMessage.value))

      users[userId].balance += amount
      users[userId].transactions.push({
        hash: txHash,
        amount,
        type: "deposit",
        time: new Date().toISOString()
      })

      totalAdded += amount
      found       = true
    }

    if (found) {
      return res.json({
        success: true,
        message: `${totalAdded} Added to balance`,
        added: totalAdded,
        new_balance: users[userId].balance
      })
    } else {
      return res.json({
        success: false,
        message: "No new deposits were found. You sent it with a memo?",
        current_balance: users[userId].balance
      })
    }

  } catch (e) {
    return res.status(500).json({ success: false, error: e.message })
  }
})

// ================== BALANCE CHECK ==================
app.get("/api/balance", (req, res) => {
  const apiKey = req.headers["x-api-key"]
  const userId = apiKeys[apiKey]

  if (!userId) {
    return res.status(401).json({ success: false, error: "Invalid API key" })
  }

  return res.json({
    success: true,
    user_id: userId,
    balance: users[userId].balance
  })
})

// ================== WITHDRAW ==================
app.post("/api/withdraw", async (req, res) => {
  const apiKey = req.headers["x-api-key"]
  const userId = apiKeys[apiKey]

  if (!userId) {
    return res.status(401).json({ success: false, error: "Invalid API key" })
  }

  const { wallet: toAddress, amount } = req.body
  const withdrawAmount = parseFloat(amount)

  if (!toAddress || !withdrawAmount || withdrawAmount <= 0) {
    return res.status(400).json({ success: false, error: "Wallet and amount are required." })
  }

  // Minimum 0.01 TON
  if (withdrawAmount < 0.01) {
    return res.status(400).json({ success: false, error: "Minimum withdrawal 0.01 TON" })
  }

  if (users[userId].balance < withdrawAmount) {
    return res.status(400).json({
      success: false,
      error: "Not enough balance",
      balance: users[userId].balance
    })
  }

  try {
    // Address validation
    Address.parse(toAddress)
  } catch (_) {
    return res.status(400).json({ success: false, error: "Incorrect wallet address" })
  }

  try {
    const client = await getTonClient()
    const { contract, keyPair } = await getMasterWallet(client)

    const seqno = await contract.getSeqno()

    await contract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to:    toAddress,
          value: toNano(withdrawAmount.toString()),
          body:  "Withdraw - TBL Earn"
        })
      ]
    })

    // Balance deduction
    users[userId].balance -= withdrawAmount
    users[userId].transactions.push({
      type:   "withdraw",
      amount: withdrawAmount,
      to:     toAddress,
      time:   new Date().toISOString()
    })

    return res.json({
      success: true,
      message: `${withdrawAmount} TON পাঠানো হয়েছে`,
      sent_to:     toAddress,
      amount_sent: withdrawAmount,
      new_balance: users[userId].balance
    })

  } catch (e) {
    return res.status(500).json({ success: false, error: e.message })
  }
})

// ================== TRANSACTION HISTORY ==================
app.get("/api/transactions", (req, res) => {
  const apiKey = req.headers["x-api-key"]
  const userId = apiKeys[apiKey]

  if (!userId) {
    return res.status(401).json({ success: false, error: "Invalid API key" })
  }

  return res.json({
    success: true,
    transactions: users[userId].transactions.slice(-20) // Last 20
  })
})

// ================== ADMIN: ADD BALANCE ==================
app.post("/admin/add-balance", (req, res) => {
  const secret = req.headers["admin-secret"]

  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ success: false, error: "Unauthorized" })
  }

  const { user_id, amount } = req.body

  if (!user_id || !amount) {
    return res.status(400).json({ success: false, error: "user_id & Amount required" })
  }

  if (!users[user_id]) {
    return res.status(404).json({ success: false, error: "User not found." })
  }

  users[user_id].balance += parseFloat(amount)

  return res.json({
    success: true,
    user_id,
    new_balance: users[user_id].balance
  })
})

// ================== ADMIN: ALL USERS ==================
app.get("/admin/users", (req, res) => {
  const secret = req.headers["admin-secret"]

  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ success: false, error: "Unauthorized" })
  }

  const summary = Object.entries(users).map(([id, data]) => ({
    user_id: id,
    balance: data.balance,
    memo:    data.memo,
    tx_count: data.transactions.length
  }))

  return res.json({ success: true, total: summary.length, users: summary })
})

// ==================== DOCS ROUTES ====================

// Route 1: /docs → docs.html
app.get("/docs", (req, res) => {
  res.sendFile(path.join(__dirname, "docs.html"))
})

app.get("/wallet", (req, res) => {
  res.sendFile(path.join(__dirname, "wallet.html"))
})

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"))
})

// ================== SERVER ==================
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`SAFORA LIVE ON: http://localhost:${PORT}`)
})