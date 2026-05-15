const express = require("express")
const dotenv  = require("dotenv")
dotenv.config()

const app = express()
app.use(express.json())
app.use(express.static("public")) // HTML files serve করবে

// ══════════════════════════════════════════
// IN-MEMORY DATABASE
// ══════════════════════════════════════════
let users    = {}  // userId => { balance, apiKey, memo, depAddr, createdAt, txs }
let apiKeys  = {}  // apiKey => userId
let memoMap  = {}  // memo   => userId

// ADMIN SETTINGS — default values
let adminSettings = {
  ton_min_deposit:    0.01,
  ton_min_withdraw:   0.01,
  ton_network_fee:    0.001,
  usdt_min_deposit:   0.01,
  usdt_min_withdraw:  0.01,
  usdt_network_fee:   0,
  ton_price_usd:      2.2,
  api_lock_hours:     48,      // same user কতক্ষণ নতুন api বানাতে পারবে না
  master_wallet:      process.env.MASTER_WALLET_ADDRESS || "",
  network_name:       "The Open Network",
  confirmation_time:  "~5 sec"
}

// ══════════════════════════════════════════
// TON IMPORTS
// ══════════════════════════════════════════
const { TonClient, WalletContractV4, internal, toNano, fromNano, Address } = require("@ton/ton")
const { mnemonicToPrivateKey } = require("@ton/crypto")
const { getHttpEndpoint }      = require("@orbs-network/ton-access")

async function getTonClient() {
  const endpoint = await getHttpEndpoint({ network: "mainnet" })
  return new TonClient({ endpoint })
}

async function getMasterWallet(client) {
  const mnemonic = process.env.MNEMONIC.split(" ")
  const keyPair  = await mnemonicToPrivateKey(mnemonic)
  const wallet   = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey })
  return { wallet, keyPair, contract: client.open(wallet) }
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function makeApiKey() {
  return "tbl_" + Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10)
}
function makeMemo() {
  return "DEP" + Math.floor(Math.random() * 9000000 + 1000000)
}
function authUser(req) {
  const key = req.headers["x-api-key"]
  const uid = apiKeys[key]
  if (!uid) return null
  return { uid, user: users[uid] }
}
function adminAuth(req) {
  return req.headers["admin-secret"] === process.env.ADMIN_SECRET
}

// ══════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════
app.get("/", (req, res) => res.send("SAFEORA API v3.0 RUNNING"))

// ══════════════════════════════════════════
// REGISTER — 48H LOCK SYSTEM
// ══════════════════════════════════════════
app.post("/api/register", (req, res) => {
  const userId = String(req.body.user_id || "").trim()
  if (!userId) return res.json({ success: false, error: "user_id required" })

  const lockHours = adminSettings.api_lock_hours
  const now       = Date.now()

  // আগে থেকে থাকলে
  if (users[userId]) {
    const created = users[userId].createdAt
    const elapsed = (now - created) / 1000 / 3600  // hours

    if (elapsed < lockHours) {
      const remaining = Math.ceil(lockHours - elapsed)
      return res.json({
        success:   false,
        locked:    true,
        error:     `API already created. You cannot create a new API for ${remaining} more hour(s).`,
        remaining_hours: remaining,
        api_key:   users[userId].apiKey  // পুরানো key ফেরত দাও
      })
    }

    // Lock শেষ হলে পুরানো data মুছে নতুন বানাও
    const oldKey  = users[userId].apiKey
    const oldMemo = users[userId].memo
    delete apiKeys[oldKey]
    delete memoMap[oldMemo]
  }

  const apiKey = makeApiKey()
  const memo   = makeMemo()
  const depAddr = adminSettings.master_wallet

  users[userId] = {
    balance:   0,
    apiKey,
    memo,
    depAddr,
    createdAt: now,
    txs:       []
  }
  apiKeys[apiKey] = userId
  memoMap[memo]   = userId

  return res.json({
    success: true,
    api_key: apiKey,
    deposit_info: {
      address: depAddr,
      memo,
      note: "Include this memo/comment when sending TON"
    }
  })
})

// ══════════════════════════════════════════
// BALANCE
// ══════════════════════════════════════════
app.get("/api/balance", (req, res) => {
  const auth = authUser(req)
  if (!auth) return res.json({ success: false, error: "Invalid API key" })
  return res.json({ success: true, balance: auth.user.balance })
})

// ══════════════════════════════════════════
// DEPOSIT INFO
// ══════════════════════════════════════════
app.get("/api/deposit/info", (req, res) => {
  const auth = authUser(req)
  if (!auth) return res.json({ success: false, error: "Invalid API key" })

  const s = adminSettings
  return res.json({
    success: true,
    deposit_address: auth.user.depAddr || adminSettings.master_wallet,
    memo:    auth.user.memo,
    ton: {
      min_deposit:   s.ton_min_deposit,
      network_fee:   s.ton_network_fee,
      network_name:  s.network_name,
      confirmation:  s.confirmation_time
    },
    usdt: {
      min_deposit:   s.usdt_min_deposit,
      network_fee:   s.usdt_network_fee,
      network_name:  s.network_name,
      confirmation:  s.confirmation_time
    }
  })
})

// ══════════════════════════════════════════
// DEPOSIT VERIFY — Blockchain Scan
// ══════════════════════════════════════════
app.post("/api/deposit/verify", async (req, res) => {
  const auth = authUser(req)
  if (!auth) return res.json({ success: false, error: "Invalid API key" })

  const { uid, user } = auth

  try {
    const client = await getTonClient()
    const { wallet } = await getMasterWallet(client)

    // শেষ 30টা transaction চেক
    const txs = await client.getTransactions(wallet.address, { limit: 30 })

    let totalAdded = 0
    let found      = false

    for (const tx of txs) {
      if (!tx.inMessage) continue

      // Value পড়ো
      const value = tx.inMessage.info?.value?.coins
      if (!value) continue

      const amount = parseFloat(fromNano(value))
      if (amount <= 0) continue

      // Comment/memo পড়ো
      let comment = ""
      try {
        const body  = tx.inMessage.body
        const slice = body.beginParse()
        const op    = slice.loadUint(32)
        if (op === 0) comment = slice.loadStringTail().trim()
      } catch (_) { continue }

      if (comment !== user.memo) continue

      // Duplicate চেক
      const txHash = tx.hash().toString("hex")
      if (user.txs.some(t => t.hash === txHash)) continue

      // Min deposit চেক
      if (amount < adminSettings.ton_min_deposit) continue

      // Credit করো
      user.balance += amount
      user.txs.push({
        hash:   txHash,
        amount,
        type:   "deposit",
        asset:  "TON",
        time:   new Date().toISOString()
      })

      totalAdded += amount
      found       = true
    }

    if (found) {
      return res.json({
        success:     true,
        message:     `${totalAdded.toFixed(4)} TON added to your balance`,
        added:       totalAdded,
        new_balance: user.balance
      })
    } else {
      return res.json({
        success: false,
        message: "No new deposits found. Make sure you included the memo.",
        current_balance: user.balance
      })
    }

  } catch (e) {
    return res.json({ success: false, error: e.message })
  }
})

// ══════════════════════════════════════════
// WITHDRAW
// ══════════════════════════════════════════
app.post("/api/withdraw", async (req, res) => {
  const auth = authUser(req)
  if (!auth) return res.json({ success: false, error: "Invalid API key" })

  const { uid, user } = auth
  const { wallet: toAddr, amount, asset = "TON" } = req.body
  const amt = parseFloat(amount)

  // Validation
  if (!toAddr || !amt || amt <= 0)
    return res.json({ success: false, error: "wallet and amount required" })

  const minWith = asset === "USDT" ? adminSettings.usdt_min_withdraw : adminSettings.ton_min_withdraw
  const fee     = asset === "USDT" ? adminSettings.usdt_network_fee  : adminSettings.ton_network_fee

  if (amt < minWith)
    return res.json({ success: false, error: `Minimum withdraw is ${minWith} ${asset}` })
  if (user.balance < amt)
    return res.json({ success: false, error: "Insufficient balance" })

  // Address validate
  try { Address.parse(toAddr) } catch (_) {
    return res.json({ success: false, error: "Invalid TON wallet address" })
  }

  try {
    const client = await getTonClient()
    const { contract, keyPair } = await getMasterWallet(client)
    const seqno = await contract.getSeqno()

    await contract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [internal({ to: toAddr, value: toNano(amt.toString()), body: "Withdraw - SAFEORA" })]
    })

    user.balance -= amt
    user.txs.push({ type: "withdraw", asset, amount: amt, to: toAddr, time: new Date().toISOString() })

    return res.json({ success: true, message: `${amt} ${asset} sent successfully`, new_balance: user.balance })
  } catch (e) {
    return res.json({ success: false, error: e.message })
  }
})

// ══════════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════════
app.get("/api/transactions", (req, res) => {
  const auth = authUser(req)
  if (!auth) return res.json({ success: false, error: "Invalid API key" })
  return res.json({ success: true, transactions: auth.user.txs.slice(-50) })
})

// ══════════════════════════════════════════
// ADMIN — GET SETTINGS
// ══════════════════════════════════════════
app.get("/admin/settings", (req, res) => {
  if (!adminAuth(req)) return res.status(403).json({ success: false, error: "Unauthorized" })
  return res.json({ success: true, settings: adminSettings })
})

// ══════════════════════════════════════════
// ADMIN — UPDATE SETTINGS
// ══════════════════════════════════════════
app.post("/admin/settings", (req, res) => {
  if (!adminAuth(req)) return res.status(403).json({ success: false, error: "Unauthorized" })

  const allowed = [
    "ton_min_deposit","ton_min_withdraw","ton_network_fee",
    "usdt_min_deposit","usdt_min_withdraw","usdt_network_fee",
    "ton_price_usd","api_lock_hours","master_wallet",
    "network_name","confirmation_time"
  ]

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      adminSettings[key] = typeof adminSettings[key] === "number"
        ? parseFloat(req.body[key])
        : req.body[key]
    }
  }

  // master_wallet আপডেট হলে সব user এর depAddr আপডেট করো
  if (req.body.master_wallet) {
    for (const uid in users) users[uid].depAddr = req.body.master_wallet
  }

  return res.json({ success: true, settings: adminSettings })
})

// ══════════════════════════════════════════
// ADMIN — ALL USERS
// ══════════════════════════════════════════
app.get("/admin/users", (req, res) => {
  if (!adminAuth(req)) return res.status(403).json({ success: false, error: "Unauthorized" })
  const list = Object.entries(users).map(([id, u]) => ({
    user_id:  id,
    balance:  u.balance,
    api_key:  u.apiKey,
    memo:     u.memo,
    tx_count: u.txs.length,
    created:  new Date(u.createdAt).toISOString()
  }))
  return res.json({ success: true, total: list.length, users: list })
})

// ══════════════════════════════════════════
// ADMIN — ADD BALANCE MANUALLY
// ══════════════════════════════════════════
app.post("/admin/add-balance", (req, res) => {
  if (!adminAuth(req)) return res.status(403).json({ success: false, error: "Unauthorized" })
  const { user_id, amount } = req.body
  if (!users[user_id]) return res.json({ success: false, error: "User not found" })
  users[user_id].balance += parseFloat(amount)
  return res.json({ success: true, new_balance: users[user_id].balance })
})

// ══════════════════════════════════════════
// DOCS PAGE
// ══════════════════════════════════════════
app.get("/docs", (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>SAFEORA API Docs</title>
<style>
body{background:#07090f;color:#f1f5f9;font-family:monospace;padding:30px;max-width:700px;margin:auto}
h1{color:#3b82f6;margin-bottom:4px}
h2{color:#94a3b8;font-size:14px;margin-bottom:30px;font-weight:400}
h3{color:#60a5fa;margin:24px 0 8px;font-size:16px}
.ep{background:#0c1120;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;margin-bottom:12px}
.badge{display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;margin-right:10px}
.post{background:rgba(59,130,246,.15);color:#3b82f6}
.get{background:rgba(34,197,94,.15);color:#22c55e}
code{background:#1a2336;padding:2px 8px;border-radius:5px;color:#f59e0b;font-size:12px}
p{color:#94a3b8;font-size:13px;margin-top:6px}
pre{background:#0c1120;border:1px solid rgba(255,255,255,.06);padding:14px;border-radius:10px;font-size:12px;overflow-x:auto;color:#e2e8f0}
</style></head><body>
<h1>SAFEORA API Documentation</h1>
<h2>Base URL: https://safeora.onrender.com</h2>
<h3>Authentication</h3>
<p>Include your API key in the header: <code>x-api-key: YOUR_API_KEY</code></p>
<h3>Admin Authentication</h3>
<p>Include in header: <code>admin-secret: YOUR_ADMIN_SECRET</code></p>
<h3>Endpoints</h3>
<div class="ep"><span class="badge post">POST</span><strong>/api/register</strong><p>Register user & get API key. 48h lock after creation.</p>
<pre>Body: { "user_id": "your_unique_id" }</pre></div>
<div class="ep"><span class="badge get">GET</span><strong>/api/balance</strong><p>Get wallet balance.</p></div>
<div class="ep"><span class="badge get">GET</span><strong>/api/deposit/info</strong><p>Get deposit address, memo & network details.</p></div>
<div class="ep"><span class="badge post">POST</span><strong>/api/deposit/verify</strong><p>Verify & credit on-chain TON deposit.</p></div>
<div class="ep"><span class="badge post">POST</span><strong>/api/withdraw</strong><p>Withdraw TON to external address.</p>
<pre>Body: { "wallet": "EQ...", "amount": 0.5, "asset": "TON" }</pre></div>
<div class="ep"><span class="badge get">GET</span><strong>/api/transactions</strong><p>Get last 50 transactions.</p></div>
<div class="ep"><span class="badge get">GET</span><strong>/admin/settings</strong><p>Get all admin settings.</p></div>
<div class="ep"><span class="badge post">POST</span><strong>/admin/settings</strong><p>Update min deposits, fees, prices etc.</p>
<pre>Body: { "ton_min_deposit": 0.01, "ton_network_fee": 0.001, "ton_price_usd": 2.2 }</pre></div>
<div class="ep"><span class="badge get">GET</span><strong>/admin/users</strong><p>List all users.</p></div>
<div class="ep"><span class="badge post">POST</span><strong>/admin/add-balance</strong><p>Manually add balance to user.</p>
<pre>Body: { "user_id": "uid", "amount": 5 }</pre></div>
</body></html>`)
})

// ══════════════════════════════════════════
// SERVER START
// ══════════════════════════════════════════
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`SAFEORA API running on port ${PORT}`))