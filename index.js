const express = require("express")
const dotenv = require("dotenv")

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

app.get("/docs", (req, res) => {

res.send(`
<!DOCTYPE html>
<html>
<head>
<title>TBL EARN API</title>

<style>

body{
background:#0f172a;
color:white;
font-family:Arial;
padding:20px;
}

.card{
background:#1e293b;
padding:20px;
border-radius:12px;
margin-top:20px;
}

code{
background:black;
padding:10px;
display:block;
border-radius:10px;
overflow:auto;
color:#00ff88;
}

h1{
color:#38bdf8;
}

</style>

</head>

<body>

<h1>🚀 TBL EARN API DOCS</h1>

<div class="card">

<h2>POST /ton/send</h2>

<p>Send TON instantly</p>

<code>
POST /ton/send
</code>

</div>

<div class="card">

<h2>Headers</h2>

<code>
x-api-key: YOUR_API_KEY
Content-Type: application/json
</code>

</div>

<div class="card">

<h2>Body</h2>

<code>
{
 "wallet":"UQXXXX",
 "amount":0.05
}
</code>

</div>

<div class="card">

<h2>TBL Example</h2>

<code>
HTTP.post({

url:
"https://tbl-earn-production.up.railway.app/ton/send",

headers:{
"x-api-key":"YOUR_API_KEY",
"Content-Type":"application/json"
},

body:{
wallet:"UQXXXX",
amount:0.05
}

})
</code>

</div>

</body>
</html>
`)

})
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("TON API STARTED")
})
