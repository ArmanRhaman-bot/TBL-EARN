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

    const sendAmount = toNano(amount)

    // reserve small gas
    const gasReserve = toNano("0.03")

    if (balance < sendAmount + gasReserve) {

      return res.json({
        success: false,
        error: "Insufficient wallet balance"
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
    const txHash =
      "TON_" + Date.now()

    return res.json({
      success: true,
      tx_hash: txHash
    })

  } catch (e) {

    return res.json({
      success: false,
      error: e.message
    })

  }

})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("TON API STARTED")
})
