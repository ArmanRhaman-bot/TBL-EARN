const express = require("express")
const dotenv = require("dotenv")

dotenv.config()

const app = express()
app.use(express.json())

// ================== IN-MEMORY DATABASE ==================
let users = {}      // userId => { balance, apiKey, depositAddress, pendingDeposits }
let apiKeys = {}    // apiKey => userId
let depositMap = {} // depositMemo => userId (TON comment দিয়ে ম্যাচ করবে)

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
    name: "TBL Earn - TON Payment Gateway API",
    version: "2.0.0",
    endpoints: {
      "POST /api/register":      "নতুন ইউজার রেজিস্ট্রেশন + API key পাবে",
      "GET  /api/deposit/info":  "ডিপোজিট অ্যাড্রেস ও মেমো পাবে (x-api-key লাগবে)",
      "POST /api/deposit/verify":"ডিপোজিট ভেরিফাই করে ব্যালেন্স আপডেট করবে",
      "GET  /api/balance":       "ব্যালেন্স চেক (x-api-key লাগবে)",
      "POST /api/withdraw":      "TON উইথড্র (x-api-key লাগবে)",
      "POST /admin/add-balance": "অ্যাডমিন ব্যালেন্স অ্যাড (admin-secret লাগবে)",
      "GET  /admin/users":       "সব ইউজার দেখো (admin-secret লাগবে)"
    }
  })
})

// ================== REGISTER ==================
// নতুন ইউজার রেজিস্ট্রেশন — API key পাবে
app.post("/api/register", (req, res) => {
  const { user_id } = req.body

  if (!user_id) {
    return res.status(400).json({ success: false, error: "user_id আবশ্যক" })
  }

  // আগে থেকে থাকলে একই key ফেরত দাও
  if (users[user_id]) {
    return res.json({
      success: true,
      message: "আগে থেকেই রেজিস্টার্ড",
      api_key: users[user_id].apiKey,
      balance: users[user_id].balance
    })
  }

  const apiKey = generateApiKey()
  const memo   = generateMemo()

  users[user_id] = {
    balance: 0,
    apiKey,
    memo,             // ডিপোজিটের সময় এই memo কমেন্টে দিতে হবে
    transactions: []
  }

  apiKeys[apiKey]   = user_id
  depositMap[memo]  = user_id

  return res.status(201).json({
    success: true,
    message: "রেজিস্ট্রেশন সফল",
    api_key: apiKey,
    balance: 0,
    deposit_info: {
      address: process.env.MASTER_WALLET_ADDRESS || "আপনার মাস্টার ওয়ালেট অ্যাড্রেস দিন",
      memo,
      note: "TON পাঠানোর সময় comment/memo তে এই কোড লিখতে হবে"
    }
  })
})

// ================== DEPOSIT INFO ==================
// ইউজার তার ডিপোজিট অ্যাড্রেস ও মেমো জানবে
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
    instruction: `TON পাঠান এই অ্যাড্রেসে। Comment/Memo তে লিখুন: ${users[userId].memo}`
  })
})

// ================== DEPOSIT VERIFY ==================
// TON ব্লকচেইন থেকে ট্রানজেকশন চেক করে ব্যালেন্স আপডেট করবে
app.post("/api/deposit/verify", async (req, res) => {
  const apiKey = req.headers["x-api-key"]
  const userId = apiKeys[apiKey]

  if (!userId) {
    return res.status(401).json({ success: false, error: "Invalid API key" })
  }

  try {
    const client   = await getTonClient()
    const { wallet, contract } = await getMasterWallet(client)

    // শেষ ১০টি ট্রানজেকশন চেক করো
    const txs = await client.getTransactions(wallet.address, { limit: 20 })

    const userMemo = users[userId].memo
    let found      = false
    let totalAdded = 0

    for (const tx of txs) {
      // শুধু incoming ট্রানজেকশন
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

      // ট্রানজেকশন আগে প্রসেস হয়েছে কিনা চেক
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
        message: `${totalAdded} TON ব্যালেন্সে যোগ হয়েছে`,
        added: totalAdded,
        new_balance: users[userId].balance
      })
    } else {
      return res.json({
        success: false,
        message: "নতুন কোনো ডিপোজিট পাওয়া যায়নি। মেমো সহ পাঠিয়েছেন তো?",
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
    return res.status(400).json({ success: false, error: "wallet ও amount আবশ্যক" })
  }

  // মিনিমাম ০.১ TON
  if (withdrawAmount < 0.1) {
    return res.status(400).json({ success: false, error: "মিনিমাম উইথড্র ০.১ TON" })
  }

  if (users[userId].balance < withdrawAmount) {
    return res.status(400).json({
      success: false,
      error: "ব্যালেন্স যথেষ্ট নেই",
      balance: users[userId].balance
    })
  }

  try {
    // Address ভ্যালিডেশন
    Address.parse(toAddress)
  } catch (_) {
    return res.status(400).json({ success: false, error: "ওয়ালেট অ্যাড্রেস ভুল" })
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

    // ব্যালেন্স কাটো
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
    transactions: users[userId].transactions.slice(-20) // শেষ ২০টি
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
    return res.status(400).json({ success: false, error: "user_id ও amount লাগবে" })
  }

  if (!users[user_id]) {
    return res.status(404).json({ success: false, error: "ইউজার পাওয়া যায়নি" })
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

// ================== SERVER ==================
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`TBL Earn API চালু: http://localhost:${PORT}`)
})
