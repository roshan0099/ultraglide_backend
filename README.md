# UltraGlide Simple Backend (Razorpay Integration)

A lightweight Node.js/Express backend that handles order creation, Razorpay checkout integration, signature verification, and local order storage via SQLite.

## Features
- **Razorpay Orders API**: Generates secure order IDs (`/api/create-order`).
- **Signature Verification**: Verifies Razorpay payment signatures using HMAC SHA-256 (`/api/verify-payment`).
- **Built-in SQLite DB**: Automatically saves customer orders and payment states (`orders.db`).
- **Zero-Friction Sandbox Mode**: If Razorpay credentials are not yet configured in `.env`, the server automatically operates in sandbox simulation mode so you can test end-to-end checkout immediately!

## Quickstart

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and add your Razorpay keys:
```env
PORT=5001
FRONTEND_URL=http://localhost:3000,http://localhost:3001
RAZORPAY_KEY_ID=rzp_test_YourKeyIdHere
RAZORPAY_KEY_SECRET=YourKeySecretHere
```
*(You can obtain test keys for free from [Razorpay Dashboard](https://dashboard.razorpay.com/) > Settings > API Keys).*

### 3. Start the Server
```bash
# Production mode
npm start

# Development mode (with live watch)
npm run dev
```

The server starts at `http://localhost:5001`.

## API Endpoints

- `GET /api/health` - Check backend and Razorpay configuration status.
- `POST /api/create-order` - Create a Razorpay order or simulated sandbox order.
- `POST /api/verify-payment` - Verify payment signature and record order in SQLite.
- `GET /api/orders` - View recent orders.
