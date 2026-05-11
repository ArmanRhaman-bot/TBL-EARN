const express = require("express")
const dotenv = require("dotenv")

let users = {}

dotenv.config()

const {
  TonClient,
  WalletContractV4,
  internal,
  toNano
} = require("@ton/ton")

const {
  mnemonicToPrivateKey
} = require("@ton/crypto")

const {
  getHttpEndpoint
} = require("@orbs-network/ton-access")

const app = express()

app.use(express.json())

// root
app.get("/", (req, res) => {
  res.send("TON WITHDRAW API WORKING")
})

// withdraw route
app.post("/ton/send", async (req, res) => {

  try {

    // API security
    const apiKey = req.headers["x-api-key"]

    if (apiKey !== process.env.API_KEY) {
      return res.json({
        success: false,
        error: "Invalid API key"
      })
    }

    const walletAddress = req.body.wallet
    const amount = parseFloat(req.body.amount)

    if (!walletAddress) {
      return res.json({
        success: false,
        error: "Wallet address missing"
      })
    }

    if (!amount || amount <= 0) {
      return res.json({
        success: false,
        error: "Invalid amount"
      })
    }

    // TON endpoint
    const endpoint = await getHttpEndpoint()

    const client = new TonClient({
      endpoint
    })

    // mnemonic
    const mnemonic = process.env.MNEMONIC.split(" ")

    // keypair
    const keyPair =
      await mnemonicToPrivateKey(mnemonic)

    // wallet
    const wallet =
      WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey
      })

    const contract =
      client.open(wallet)

    // balance check
    const balance =
  await contract.getBalance()

console.log(
  "WALLET:",
  wallet.address.toString()
)

console.log(
  "BALANCE RAW:",
  balance.toString()
)

console.log(
  "BALANCE TON:",
  Number(balance) / 1e9
)

console.log(
  "SEND:",
  amount
)

const sendAmount =
  toNano(amount.toString())

const gasReserve =
  toNano("0.01")

const required =
  sendAmount + gasReserve

console.log(
  "REQUIRED:",
  Number(required) / 1e9
)

if (BigInt(balance) < BigInt(required)) {

  return res.json({
    success: false,
    error:
      "Insufficient wallet balance"
  })

}

    // seqno
    const seqno =
      await contract.getSeqno()

    // send transaction
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

    // wait
    await new Promise(r =>
      setTimeout(r, 5000)
    )

    // tx hash placeholder
    // TON doesn't instantly expose tx hash easily
    const walletAddr =
  wallet.address.toString()

const explorerLink =
  "https://tonviewer.com/" +
  walletAddr

return res.json({
  success: true,
  tx_hash: explorerLink
})

  } catch (e) {

    return res.json({
      success: false,
      error: e.message
    })

  }

})


// CREATE USER

app.post("/create", (req, res) => {

  let master_key = req.body.master_key
  let user_id = req.body.user_id
  let api_key = req.body.api_key

  if(!api_key || !user_id){
    return res.json({
      success:false,
      error:"Missing fields"
    })
  }

  if(master_key !== process.env.MASTER_KEY){
    return res.json({
      success:false,
      error:"Unauthorized"
    })
  }

  users[api_key] = {
    user_id:user_id,
    balance:0
  }

  return res.json({
    success:true
  })

})

// ADD BALANCE
app.post("/add-balance", (req, res) => {

  let master_key = req.body.master_key
  let api_key = req.body.api_key
  let amount = parseFloat(req.body.amount)

  if(master_key !== process.env.MASTER_KEY){
    return res.json({
      success: false,
      error: "Unauthorized"
    })
  }

  if(!users[api_key]){
    return res.json({
      success: false,
      error: "User not found"
    })
  }

  users[api_key].balance += amount

  return res.json({
    success: true,
    balance: users[api_key].balance
  })

})

// CHECK BALANCE
app.get("/:api_key/balance", (req, res) => {

  let api_key = req.params.api_key
  let user = users[api_key]

  if(!user){
    return res.json({
      success: false,
      error: "User not found"
    })
  }

  return res.json({
    success: true,
    balance: user.balance
  })

})


//DOCS
const path = require("path")

app.get("/docs", (req, res) => {

  res.sendFile(
    path.join(__dirname, "docs.html")
  )

})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("TON API STARTED")
})