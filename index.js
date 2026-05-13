const express = require("express")
const dotenv = require("dotenv")
const path = require("path")

dotenv.config()

const app = express()

app.use(express.json())

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

// USDT TON Withdraw Route

app.post("/usdt/send", async (req, res) => {

  try {

    // API KEY
    const apiKey =
      req.headers["x-api-key"]

    if(apiKey !== process.env.API_KEY){

      return res.json({
        success:false,
        error:"Invalid API key"
      })

    }

    // BODY
    const walletAddress =
      req.body.wallet

    const amount =
      parseFloat(req.body.amount)

    if(!walletAddress){

      return res.json({
        success:false,
        error:"Wallet missing"
      })

    }

    if(!amount || amount <= 0){

      return res.json({
        success:false,
        error:"Invalid amount"
      })

    }

    // ENDPOINT
    const endpoint =
      await getHttpEndpoint()

    const client =
      new TonClient({
        endpoint
      })

    // MNEMONIC
    const mnemonic =
      process.env.MNEMONIC.split(" ")

    // KEYPAIR
    const keyPair =
      await mnemonicToPrivateKey(
        mnemonic
      )

    // WALLET
    const wallet =
      WalletContractV4.create({
        workchain:0,
        publicKey:keyPair.publicKey
      })

    const contract =
      client.open(wallet)

    // USDT MASTER
    const USDT_MASTER =
      Address.parse(
        "EQCxE6mUtQJKFnf..."
      )

    // OPEN MASTER
    const master =
      client.open(
        JettonMaster.create(
          USDT_MASTER
        )
      )

    // GET JETTON WALLET
    const jettonWalletAddress =
      await master.getWalletAddress(
        wallet.address
      )

    // OPEN JETTON WALLET
    const jettonWallet =
      client.open(
        JettonWallet.create(
          jettonWalletAddress
        )
      )

    // SEND USDT
    await jettonWallet.sendTransfer(

      contract.sender(
        keyPair.secretKey
      ),

      toNano("0.05"),

      {

        amount:
          BigInt(
            Math.floor(
              amount * 1000000
            )
          ),

        destination:
          Address.parse(
            walletAddress
          ),

        responseAddress:
          wallet.address

      }

    )

    return res.json({

      success:true,

      message:"USDT Sent"

    })

  } catch(e){

    return res.json({

      success:false,

      error:e.message

    })

  }

})
//DOCS
const path = require("path")

app.get("/docs", (req, res) => {

  res.sendFile(
    path.join(__dirname, "docs.html")
  )

})

const path = require("path")

app.get("/doc", (req, res) => {

  res.sendFile(
    path.join(__dirname, "doc.html")
  )

})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("TON API STARTED")
})