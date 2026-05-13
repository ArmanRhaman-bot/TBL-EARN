const express = require("express")
const dotenv = require("dotenv")
const path = require("path")

dotenv.config()

const app = express()
app.use(express.json())

// ===== MongoDB =====
const { MongoClient } = require("mongodb")

let db, users

MongoClient.connect(process.env.MONGO_URL).then(client => {
  db = client.db("gateway")
  users = db.collection("users")
  console.log("MongoDB Connected")
})

// ===== TON =====
const {
  TonClient,
  WalletContractV4,
  internal,
  toNano,
  Address,
  JettonMaster,
  JettonWallet
} = require("@ton/ton")

const { mnemonicToPrivateKey } = require("@ton/crypto")
const { getHttpEndpoint } = require("@orbs-network/ton-access")

// ==================== ROUTES ====================

// Root
app.get("/", (req, res) => {
  res.send("TON WITHDRAW API WORKING")
})

// ===== CREATE API KEY =====
const crypto = require("crypto")

app.post("/create", async (req, res) => {

  let user_id = req.body.user_id

  if(!user_id){
    return res.json({ success:false })
  }

  let api_key = crypto.randomBytes(16).toString("hex")

  await users.insertOne({
    user_id,
    api_key,
    balance: 0
  })

  return res.json({
    success:true,
    api_key
  })

})

// ===== ADD BALANCE (ADMIN USE) =====
app.post("/add-balance", async (req, res) => {

  let { api_key, amount } = req.body

  amount = parseFloat(amount)

  await users.updateOne(
    { api_key },
    { $inc: { balance: amount } }
  )

  return res.json({ success:true })

})

// ===== TON SEND (LOW LEVEL — KEEP SAME) =====
async function sendTON(walletAddress, amount){

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
        body: "TON Withdraw"
      })
    ]
  })

  return "https://tonviewer.com/" + wallet.address.toString()
}

// ===== MAIN WITHDRAW (SMART SYSTEM) =====
app.post("/withdraw", async (req, res) => {

  try {

    const api_key = req.headers["x-api-key"]
    const walletAddress = req.body.wallet
    const amount = parseFloat(req.body.amount)

    if(!api_key || !walletAddress || !amount){
      return res.json({ success:false, error:"Missing fields" })
    }

    let user = await users.findOne({ api_key })

    if(!user){
      return res.json({ success:false, error:"Invalid API key" })
    }

    if(user.balance < amount){
      return res.json({ success:false, error:"Insufficient balance" })
    }

    //SEND TON
    let tx = await sendTON(walletAddress, amount)

    //CUT BALANCE
    await users.updateOne(
      { api_key },
      { $inc: { balance: -amount } }
    )

    return res.json({
      success:true,
      tx_hash: tx,
      balance: user.balance - amount
    })

  } catch(e){

    return res.json({
      success:false,
      error:e.message
    })

  }

})

// ===== OLD ROUTE (OPTIONAL KEEP) =====
app.post("/ton/send", async (req, res) => {

  return res.json({
    success:false,
    error:"Use /withdraw instead"
  })

})

// ==================== DOCS ====================

app.get("/docs", (req, res) => {
  res.sendFile(path.join(__dirname, "docs.html"))
})

// ==================== SERVER ====================

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("TON API STARTED on port", PORT)
})