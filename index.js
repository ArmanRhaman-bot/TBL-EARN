const express = require("express")

const app = express()

app.use(express.json())

app.post("/ton/send", async(req,res)=>{

  const wallet = req.body.wallet
  const amount = req.body.amount

  console.log(wallet)
  console.log(amount)

  // TON SEND CODE HERE

  return res.json({
    success:true,
    tx_hash:"abc123"
  })

})

app.get("/",(req,res)=>{
  res.send("TON API WORKING")
})

app.listen(3000)
