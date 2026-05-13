const express = require("express")
const app = express()

require("dotenv").config()

app.use(express.json())

// ROOT
app.get("/", (req, res) => {
  res.send("TON API WORKING 🚀")
})

// TEST ROUTE
app.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "API is alive"
  })
})

// DOCS ROUTE
const path = require("path")

app.get("/docs", (req, res) => {
  res.sendFile(path.join(__dirname, "docs.html"))
})

// START SERVER
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("SERVER RUNNING ON PORT " + PORT)
})