
# 🔍📱 ScanAR

Turn any **QR code** into an **instant AR info panel** on your iPhone.  
ScanAR uses your device’s camera to detect a specific QR code and overlays helpful text, links, and status details right on screen — no extra app installs needed.

---

## ✨ Features
- 🎯 **Targeted QR** — Only reacts to the QR codes you configure.
- 🪄 **Instant Overlay** — Show titles, status, details, and links as a clean info card.
- 📱 **Web-Based** — Runs right in Safari/Chrome (no App Store build required).
- 🔧 **Customizable** — Edit one JSON object to change what’s displayed.
- ⚡ **Lightweight** — Uses [jsQR](https://github.com/cozmo/jsQR) under the hood.

---

## 📸 Demo

<img width="603" height="1311" alt="image" src="https://github.com/user-attachments/assets/c2d3114c-69b1-4dfa-ac38-0be9628e244f" />

---

## 🚀 Quick Start
1. Clone this repo:
   ```bash
   git clone https://github.com/ScanAR.git
   cd ScanAR
   ```
2. Install the dev tooling (Cloudflare Wrangler):
   ```bash
   npm install
   ```
3. Run it locally:
   ```bash
   npm run dev
   ```
   Open the printed `http://localhost:8787` URL. (Camera access requires
   `https://` or `localhost`.)

The site itself is fully static — all files live under [`public/`](public/).

---

## ☁️ Deploy to Cloudflare Workers

ScanAR ships as static assets served from Cloudflare's edge (no Worker code
required). Config lives in [`wrangler.toml`](wrangler.toml).

1. Authenticate once:
   ```bash
   npx wrangler login
   ```
2. Deploy:
   ```bash
   npm run deploy
   ```

Wrangler uploads everything in `public/` and prints your
`https://scanar.<your-subdomain>.workers.dev` URL. Re-run `npm run deploy`
to publish updates.
