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

// deposit info

app.post("/ton/deposit", async (req, res) => {

  try {

    const apiKey =
    req.headers["x-api-key"]

    if (apiKey !== process.env.API_KEY) {

      return res.json({
        success: false,
        error: "Invalid API key"
      })

    }

    const userId =
    req.body.user_id

    if (!userId) {

      return res.json({
        success: false,
        error: "user_id missing"
      })

    }

    // unique memo/comment
    const memo =
    "TBL_" + userId

    // master wallet
    const wallet =
    process.env.MASTER_WALLET

    return res.json({

      success: true,

      deposit_address: wallet,

      memo: memo,

      instruction:
      "Send TON with memo/comment"

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
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SAFEORA — API Documentation</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #03080f;
    --surface: #070f1c;
    --surface2: #0c1829;
    --border: rgba(53,182,255,0.12);
    --accent: #35b6ff;
    --accent2: #00ffa3;
    --accent3: #7b5fff;
    --text: #e2eeff;
    --muted: #4a6080;
    --danger: #ff4d6a;
    --success: #00ffa3;
    --glow: rgba(53,182,255,0.15);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Syne', sans-serif;
    min-height: 100vh;
    overflow-x: hidden;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(53,182,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(53,182,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  .orb {
    position: fixed;
    border-radius: 50%;
    filter: blur(120px);
    pointer-events: none;
    z-index: 0;
  }
  .orb-1 {
    width: 600px; height: 600px;
    background: rgba(53,182,255,0.06);
    top: -200px; left: -200px;
  }
  .orb-2 {
    width: 500px; height: 500px;
    background: rgba(0,255,163,0.05);
    bottom: -200px; right: -150px;
  }

  .wrapper {
    position: relative;
    z-index: 1;
    max-width: 860px;
    margin: 0 auto;
    padding: 60px 24px 80px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 64px;
    animation: fadeDown 0.6s ease both;
  }

  .logo-badge {
    width: 56px; height: 56px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 30px rgba(0,200,255,0.3);
    flex-shrink: 0;
    overflow: hidden;
    background: #050d18;
    border: 1px solid rgba(53,182,255,0.2);
  }

  .logo-badge img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .header-text h1 {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.5px;
    background: linear-gradient(90deg, #fff 0%, #35b6ff 60%, #00ffa3 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.1;
  }

  .header-text p {
    font-size: 13px;
    color: var(--muted);
    margin-top: 4px;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.5px;
  }

  .version-pill {
    margin-left: auto;
    background: rgba(53,182,255,0.1);
    border: 1px solid rgba(53,182,255,0.25);
    color: var(--accent);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 20px;
    letter-spacing: 1px;
    flex-shrink: 0;
  }

  .section-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 16px;
    margin-top: 48px;
    opacity: 0.8;
  }

  .endpoint-hero {
    background: linear-gradient(135deg, #0c1829 0%, #0a1422 100%);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 28px 32px;
    margin-bottom: 6px;
    position: relative;
    overflow: hidden;
    animation: fadeUp 0.5s ease 0.1s both;
  }

  .endpoint-hero::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    opacity: 0.6;
  }

  .method-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 10px;
  }

  .method-badge {
    background: linear-gradient(135deg, #1a4d7a, #0f3356);
    color: var(--accent);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid rgba(53,182,255,0.3);
    letter-spacing: 1px;
  }

  .endpoint-path {
    font-family: 'JetBrains Mono', monospace;
    font-size: 18px;
    font-weight: 500;
    color: #fff;
    letter-spacing: 0.3px;
  }

  .endpoint-desc {
    font-size: 14px;
    color: var(--muted);
    margin-top: 6px;
    line-height: 1.6;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    margin-bottom: 6px;
    overflow: hidden;
    transition: border-color 0.2s;
    animation: fadeUp 0.5s ease both;
  }

  .card:hover { border-color: rgba(53,182,255,0.25); }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px;
    border-bottom: 1px solid var(--border);
  }

  .card-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #c8d8ef;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-title .dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
  }

  .dot.green { background: var(--success); box-shadow: 0 0 8px var(--success); }
  .dot.red   { background: var(--danger);  box-shadow: 0 0 8px var(--danger);  }

  .code-wrap { position: relative; }

  pre {
    background: #020810;
    color: #7dd3fc;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.7;
    padding: 20px 22px;
    overflow-x: auto;
    white-space: pre;
    tab-size: 2;
  }

  .t-key   { color: #7dd3fc; }
  .t-str   { color: #86efac; }
  .t-num   { color: #fda4af; }
  .t-bool  { color: #c4b5fd; }
  .t-punct { color: #475569; }
  .t-meth  { color: #fb923c; }
  .t-url   { color: #a5f3fc; }
  .t-prop  { color: #f0abfc; }
  .t-comment { color: #334155; font-style: italic; }

  .copy-btn {
    position: absolute;
    top: 12px; right: 12px;
    background: rgba(53,182,255,0.1);
    border: 1px solid rgba(53,182,255,0.2);
    color: var(--accent);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    padding: 5px 12px;
    border-radius: 8px;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .copy-btn:hover {
    background: rgba(53,182,255,0.2);
    border-color: rgba(53,182,255,0.5);
  }

  .copy-btn.copied {
    background: rgba(0,255,163,0.1);
    border-color: rgba(0,255,163,0.3);
    color: var(--success);
  }

  .response-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  @media (max-width: 600px) {
    .response-grid { grid-template-columns: 1fr; }
    .endpoint-path { font-size: 15px; }
    pre { font-size: 11.5px; }
  }

  .footer {
    margin-top: 64px;
    padding-top: 28px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  .footer-brand {
    font-weight: 700;
    font-size: 13px;
    color: var(--muted);
    letter-spacing: 0.5px;
  }

  .footer-brand span {
    background: linear-gradient(90deg, #35b6ff, #00ffa3);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .footer-copy {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--muted);
  }

  @keyframes fadeDown {
    from { opacity: 0; transform: translateY(-16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .card:nth-child(1) { animation-delay: 0.15s; }
  .card:nth-child(2) { animation-delay: 0.22s; }
  .card:nth-child(3) { animation-delay: 0.29s; }
  .card:nth-child(4) { animation-delay: 0.36s; }
</style>
</head>
<body>

<div class="orb orb-1"></div>
<div class="orb orb-2"></div>

<div class="wrapper">

  <!-- Header -->
  <div class="header">
    <div class="logo-badge">
      <img src="https://iili.io/BDk3VLl.jpg" alt="SAFEORA Logo">
    </div>
    <div class="header-text">
      <h1>SAFEORA API</h1>
      <p>// REST · TON Blockchain · Instant Transfers</p>
    </div>
    <div class="version-pill">v1.0</div>
  </div>

  <!-- Endpoint Hero -->
  <div class="section-label">Endpoint</div>
  <div class="endpoint-hero">
    <div class="method-row">
      <span class="method-badge">POST</span>
      <span class="endpoint-path">/ton/send</span>
    </div>
    <p class="endpoint-desc">Transfer TON to any wallet address instantly. Requires a valid API key passed via request headers.</p>
  </div>

  <!-- Headers -->
  <div class="section-label">Authentication & Headers</div>
  <div class="card">
    <div class="card-header">
      <div class="card-title"><span class="dot"></span> Request Headers</div>
    </div>
    <div class="code-wrap">
      <button class="copy-btn" onclick="handleCopy(this, 'hdr')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy
      </button>
      <pre id="hdr"><span class="t-prop">x-api-key</span><span class="t-punct">:</span>      <span class="t-str">YOUR_API_KEY</span>
<span class="t-prop">Content-Type</span><span class="t-punct">:</span>  <span class="t-str">application/json</span></pre>
    </div>
  </div>

  <!-- Body -->
  <div class="section-label">Request Body</div>
  <div class="card">
    <div class="card-header">
      <div class="card-title"><span class="dot"></span> JSON Payload</div>
    </div>
    <div class="code-wrap">
      <button class="copy-btn" onclick="handleCopy(this, 'body')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy
      </button>
      <pre id="body"><span class="t-punct">{</span>
  <span class="t-key">"wallet"</span><span class="t-punct">:</span> <span class="t-str">"UQXXXX..."</span><span class="t-punct">,</span>
  <span class="t-key">"amount"</span><span class="t-punct">:</span> <span class="t-str">"0.05"</span>
<span class="t-punct">}</span></pre>
    </div>
  </div>

  <!-- SAFEORA Example -->
  <div class="section-label">SAFEORA Code Example</div>
  <div class="card">
    <div class="card-header">
      <div class="card-title"><span class="dot" style="background:#fb923c;box-shadow:0 0 8px #fb923c;"></span> SAFEORA Script</div>
    </div>
    <div class="code-wrap">
      <button class="copy-btn" onclick="handleCopy(this, 'tbl')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy
      </button>
      <pre id="tbl"><span class="t-meth">HTTP</span><span class="t-punct">.</span><span class="t-meth">post</span><span class="t-punct">({</span>

  <span class="t-prop">url</span><span class="t-punct">:</span>
    <span class="t-str">"https://your-api.up.railway.app/ton/send"</span><span class="t-punct">,</span>

  <span class="t-prop">headers</span><span class="t-punct">: {</span>
    <span class="t-key">"x-api-key"</span><span class="t-punct">:</span>      <span class="t-str">"API_KEY"</span><span class="t-punct">,</span>
    <span class="t-key">"Content-Type"</span><span class="t-punct">:</span>  <span class="t-str">"application/json"</span>
  <span class="t-punct">},</span>

  <span class="t-prop">body</span><span class="t-punct">: {</span>
    <span class="t-key">wallet</span><span class="t-punct">:</span>  <span class="t-str">"UQXXXX..."</span><span class="t-punct">,</span>
    <span class="t-key">amount</span><span class="t-punct">:</span>  <span class="t-str">"0.05"</span>
  <span class="t-punct">},</span>

  <span class="t-prop">success</span><span class="t-punct">:</span> <span class="t-str">"/done"</span><span class="t-punct">,</span>
  <span class="t-prop">error</span><span class="t-punct">:</span>   <span class="t-str">"/failed"</span>

<span class="t-punct">})</span></pre>
    </div>
  </div>

  <!-- Responses -->
  <div class="section-label">Responses</div>
  <div class="response-grid">

    <div class="card" style="margin-bottom:0;">
      <div class="card-header">
        <div class="card-title"><span class="dot green"></span> 200 Success</div>
      </div>
      <div class="code-wrap">
        <button class="copy-btn" onclick="handleCopy(this, 'succ')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copy
        </button>
        <pre id="succ"><span class="t-punct">{</span>
  <span class="t-key">"success"</span><span class="t-punct">:</span>  <span class="t-bool">true</span><span class="t-punct">,</span>
  <span class="t-key">"tx_hash"</span><span class="t-punct">:</span>  <span class="t-str">"TON_TX..."</span>
<span class="t-punct">}</span></pre>
      </div>
    </div>

    <div class="card" style="margin-bottom:0;">
      <div class="card-header">
        <div class="card-title"><span class="dot red"></span> 4xx Error</div>
      </div>
      <div class="code-wrap">
        <button class="copy-btn" onclick="handleCopy(this, 'err')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copy
        </button>
        <pre id="err"><span class="t-punct">{</span>
  <span class="t-key">"success"</span><span class="t-punct">:</span>  <span class="t-bool">false</span><span class="t-punct">,</span>
  <span class="t-key">"error"</span><span class="t-punct">:</span>    <span class="t-str">"Insufficient..."</span>
<span class="t-punct">}</span></pre>
      </div>
    </div>

  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-brand"><span>SAFEORA</span> API Documentation</div>
    <div class="footer-copy">© 2026 — All rights reserved</div>
  </div>

</div>

<script>
function handleCopy(btn, id) {
  const pre = document.getElementById(id);
  const text = pre.innerText;
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy';
    }, 1800);
  });
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
