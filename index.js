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

<title>TBL EARN API DOCS</title>

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<style>

body{
  background:#081224;
  color:white;
  font-family:Arial;
  padding:20px;
  margin:0;
}

.title{
  font-size:32px;
  font-weight:bold;
  margin-bottom:20px;
  color:#35b6ff;
}

.card{
  background:#132238;
  padding:20px;
  border-radius:18px;
  margin-top:20px;
  box-shadow:0 0 10px rgba(0,0,0,0.3);
}

.codeBox{
  position:relative;
  margin-top:15px;
}

pre{
  background:#000;
  color:#00ff88;
  padding:15px;
  border-radius:12px;
  overflow:auto;
  font-size:14px;
  white-space:pre-wrap;
  word-wrap:break-word;
}

.copyBtn{
  position:absolute;
  top:10px;
  right:10px;
  border:none;
  background:#35b6ff;
  color:white;
  padding:8px 14px;
  border-radius:10px;
  cursor:pointer;
  font-weight:bold;
}

.copyBtn:hover{
  opacity:0.8;
}

.success{
  color:#00ff88;
}

.error{
  color:#ff4d4d;
}

.footer{
  text-align:center;
  margin-top:30px;
  color:#aaa;
}

</style>

</head>

<body>

<div class="title">
🚀 TBL EARN API DOCS
</div>

<div class="card">

<h2>POST /ton/send</h2>

<p>
Send TON instantly
</p>

<div class="codeBox">

<button class="copyBtn"
onclick="copyText('endpointCode')">
Copy
</button>

<pre id="endpointCode">
POST /ton/send
</pre>

</div>

</div>

<div class="card">

<h2>Headers</h2>

<div class="codeBox">

<button class="copyBtn"
onclick="copyText('headerCode')">
Copy
</button>

<pre id="headerCode">
x-api-key: YOUR_API_KEY
Content-Type: application/json
</pre>

</div>

</div>

<div class="card">

<h2>Body</h2>

<div class="codeBox">

<button class="copyBtn"
onclick="copyText('bodyCode')">
Copy
</button>

<pre id="bodyCode">
{
  "wallet":"UQXXXX",
  "amount":"0.05"
}
</pre>

</div>

</div>

<div class="card">

<h2>TBL Example</h2>

<div class="codeBox">

<button class="copyBtn"
onclick="copyText('tblCode')">
Copy
</button>

<pre id="tblCode">
HTTP.post({

  url:
  "https://your-api.up.railway.app/ton/send",

  headers:{
    "x-api-key":"API_KEY",
    "Content-Type":"application/json"
  },

  body:{
    wallet:"UQXXXX",
    amount:"0.05"
  },

  success:"/done",
  error:"/failed"

})
</pre>

</div>

</div>

<div class="card">

<h2 class="success">
✅ Success Response
</h2>

<div class="codeBox">

<button class="copyBtn"
onclick="copyText('successCode')">
Copy
</button>

<pre id="successCode">
{
  "success":true,
  "tx_hash":"TON_TX_HASH"
}
</pre>

</div>

</div>

<div class="card">

<h2 class="error">
❌ Error Response
</h2>

<div class="codeBox">

<button class="copyBtn"
onclick="copyText('errorCode')">
Copy
</button>

<pre id="errorCode">
{
  "success":false,
  "error":"Insufficient balance"
}
</pre>

</div>

</div>

<div class="footer">
TBL EARN API © 2026
</div>

<script>

function copyText(id){

  const text =
  document.getElementById(id).innerText

  navigator.clipboard.writeText(text)

  alert("Copied!")

}

</script>

</body>

</html>

`)

})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("TON API STARTED")
})
