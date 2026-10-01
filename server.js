import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// CORS setup to allow frontend requests
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map(url => url.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive in dev mode
  },
  credentials: true
}));

app.use(express.json());

// Initialize SQLite database
const dbPath = process.env.DB_PATH || path.join(__dirname, 'orders.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Setup orders table
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE,
    payment_id TEXT,
    amount INTEGER,
    currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'created',
    product_code TEXT,
    product_name TEXT,
    volume TEXT,
    quantity INTEGER,
    items_json TEXT,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    customer_pincode TEXT,
    customer_city TEXT,
    customer_state TEXT,
    is_sandbox INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Safe migration if items_json column was not previously present
try {
  db.exec(`ALTER TABLE orders ADD COLUMN items_json TEXT`);
} catch (e) {
  // Column already exists
}

// Razorpay Client Setup
const key_id = process.env.RAZORPAY_KEY_ID?.trim();
const key_secret = process.env.RAZORPAY_KEY_SECRET?.trim();
const isConfigured = Boolean(key_id && key_secret);

let razorpay = null;
if (isConfigured) {
  razorpay = new Razorpay({
    key_id: key_id,
    key_secret: key_secret
  });
  console.log('⚡ Razorpay gateway initialized with configured credentials.');
} else {
  console.warn('⚠️ RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET not set in .env.');
  console.warn('⚡ Running in SANDBOX SIMULATION mode. You can test checkout without live credentials.');
}

// Authoritative Server-Side Product Catalog & Prices (Source of Truth)
export const PRODUCT_CATALOG = {
  "UG-CL-500": {
    id: 1,
    name: "Chain Lube",
    prices: { "150ml": 199, "500ml": 449 }
  },
  "UG-CC-500": {
    id: 2,
    name: "Chain Cleaner",
    prices: { "150ml": 189, "500ml": 429 }
  },
  "UG-TB-500": {
    id: 3,
    name: "Throttle Body Cleaner",
    prices: { "150ml": 219, "500ml": 489 }
  },
  "UG-RO-500": {
    id: 4,
    name: "Rust Off",
    prices: { "150ml": 179, "500ml": 399 }
  },
  "UG-SC-500": {
    id: 5,
    name: "Silencer Coating",
    prices: { "150ml": 249, "500ml": 549 }
  }
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ultraglide-backend',
    razorpay_configured: isConfigured,
    time: new Date().toISOString()
  });
});

// Endpoint to retrieve verified product catalog and current prices
app.get('/api/catalog', (req, res) => {
  res.json({
    success: true,
    catalog: PRODUCT_CATALOG
  });
});

// Create Order endpoint with strict server-side price verification (single or multi-product)
app.post('/api/create-order', async (req, res) => {
  try {
    const { customer } = req.body;

    // Support both multi-item cart (items: [...]) and single product backward-compatible payloads
    let rawItems = [];
    if (Array.isArray(req.body.items) && req.body.items.length > 0) {
      rawItems = req.body.items;
    } else if (req.body.productCode || req.body.productId) {
      rawItems = [{
        productCode: req.body.productCode,
        productId: req.body.productId,
        volume: req.body.volume,
        quantity: req.body.quantity || 1,
        price: req.body.price
      }];
    } else {
      return res.status(400).json({
        success: false,
        error: 'No products provided for checkout'
      });
    }

    const verifiedItems = [];
    let totalAmountInInr = 0;
    let totalQuantity = 0;

    // Verify each item against authoritative server catalog
    for (const rawItem of rawItems) {
      const { productCode, productId, volume, quantity = 1, price } = rawItem;

      if (!volume) {
        return res.status(400).json({
          success: false,
          error: `Missing volume for product ${productCode || productId || 'item'}`
        });
      }

      let productEntry = null;
      let verifiedCode = productCode;

      if (productCode && PRODUCT_CATALOG[productCode]) {
        productEntry = PRODUCT_CATALOG[productCode];
      } else if (productId) {
        const match = Object.entries(PRODUCT_CATALOG).find(
          ([, item]) => item.id === Number(productId)
        );
        if (match) {
          verifiedCode = match[0];
          productEntry = match[1];
        }
      }

      if (!productEntry) {
        return res.status(400).json({
          success: false,
          error: `Invalid product: ${productCode || productId}`
        });
      }

      // Authoritative Price Lookup for the selected volume
      const verifiedUnitPrice = productEntry.prices[volume];
      if (typeof verifiedUnitPrice !== 'number' || verifiedUnitPrice <= 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid volume "${volume}" for ${productEntry.name}. Available: ${Object.keys(productEntry.prices).join(', ')}`
        });
      }

      // Detect tampering attempt if client tried to submit an altered price
      if (price && Number(price) !== verifiedUnitPrice) {
        console.warn(`🚨 SECURITY WARNING: Price mismatch on product ${verifiedCode}. Client submitted: ₹${price}, Verified Server Price: ₹${verifiedUnitPrice}. Overriding with server price.`);
      }

      const validQty = Math.max(1, Math.min(50, Math.floor(Number(quantity) || 1)));
      const itemSubtotal = verifiedUnitPrice * validQty;

      verifiedItems.push({
        productCode: verifiedCode,
        productName: productEntry.name,
        volume,
        unitPrice: verifiedUnitPrice,
        quantity: validQty,
        subtotal: itemSubtotal
      });

      totalAmountInInr += itemSubtotal;
      totalQuantity += validQty;
    }

    if (verifiedItems.length === 0 || totalAmountInInr <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Order total must be greater than zero'
      });
    }

    const amountInPaise = Math.round(totalAmountInInr * 100);
    const summaryText = verifiedItems
      .map((i) => `${i.productName} (${i.volume}) x ${i.quantity}`)
      .join(', ');

    let orderId = '';
    let isSandbox = false;

    if (isConfigured && razorpay) {
      const options = {
        amount: amountInPaise,
        currency: 'INR',
        receipt: `ug_rcpt_${Date.now()}`,
        notes: {
          items: summaryText.substring(0, 250),
          customer_name: customer?.name || 'Customer',
          customer_phone: customer?.phone || ''
        }
      };

      const order = await razorpay.orders.create(options);
      orderId = order.id;
    } else {
      // Sandbox simulated order
      isSandbox = true;
      orderId = `order_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }

    // Save order in database with items_json
    const insertStmt = db.prepare(`
      INSERT INTO orders (
        order_id,
        amount,
        currency,
        status,
        product_code,
        product_name,
        volume,
        quantity,
        items_json,
        customer_name,
        customer_email,
        customer_phone,
        customer_address,
        customer_pincode,
        customer_city,
        customer_state,
        is_sandbox
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      orderId,
      amountInPaise,
      'INR',
      'created',
      verifiedItems.map((i) => i.productCode).join(','),
      summaryText,
      verifiedItems.map((i) => i.volume).join(','),
      totalQuantity,
      JSON.stringify(verifiedItems),
      customer?.name || '',
      customer?.email || '',
      customer?.phone || '',
      customer?.address || '',
      customer?.pincode || '',
      customer?.city || '',
      customer?.state || '',
      isSandbox ? 1 : 0
    );

    res.json({
      success: true,
      orderId,
      amount: amountInPaise,
      currency: 'INR',
      keyId: key_id || 'rzp_test_simulated_mode',
      isSandbox,
      summary: summaryText,
      items: verifiedItems,
      totalItems: totalQuantity,
      totalAmount: totalAmountInInr
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while creating order'
    });
  }
});

// Verify Payment endpoint
app.post('/api/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      isSandbox
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing razorpay_order_id or razorpay_payment_id'
      });
    }

    // Signature verification for live Razorpay
    if (isConfigured && !isSandbox) {
      const generatedSignature = crypto
        .createHmac('sha256', key_secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        // Mark order as failed verification in DB
        const failStmt = db.prepare(`
          UPDATE orders SET status = 'failed' WHERE order_id = ?
        `);
        failStmt.run(razorpay_order_id);

        return res.status(400).json({
          success: false,
          error: 'Payment verification failed: invalid signature'
        });
      }
    }

    // Update order status to paid
    const updateStmt = db.prepare(`
      UPDATE orders 
      SET status = 'paid', payment_id = ? 
      WHERE order_id = ?
    `);
    updateStmt.run(razorpay_payment_id, razorpay_order_id);

    // Retrieve full order details
    const orderDetails = db.prepare(`
      SELECT * FROM orders WHERE order_id = ?
    `).get(razorpay_order_id);

    // Sync order to Google Sheet dashboard (asynchronous)
    syncOrderToSheet(orderDetails).catch((err) => {
      console.warn('Non-blocking sheet sync error:', err.message);
    });

    res.json({
      success: true,
      message: 'Payment verified and order recorded successfully!',
      order: orderDetails
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while verifying payment'
    });
  }
});

// Helper: Sync order details to Google Sheet Webhook
async function syncOrderToSheet(order) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return;
  }

  try {
    const payload = {
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      orderId: order.order_id,
      paymentId: order.payment_id || 'N/A',
      amount: `₹${(order.amount / 100).toFixed(2)}`,
      status: order.status.toUpperCase(),
      customerName: order.customer_name || 'Anonymous',
      phone: order.customer_phone || 'N/A',
      email: order.customer_email || 'N/A',
      address: [order.customer_address, order.customer_city, order.customer_state, order.customer_pincode]
        .filter(Boolean)
        .join(', '),
      items: order.product_name,
      quantity: order.quantity
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const responseText = await res.text().catch(() => '');
    if (res.ok && !responseText.includes('You need access')) {
      console.log(`📊 Order ${order.order_id} synced to Google Sheet dashboard.`);
    } else if (responseText.includes('You need access')) {
      console.error(`❌ Google Sheet Permission Error: The Google Apps Script deployment must be set to "Who has access: Anyone". Currently it requires Google login.`);
    } else {
      console.warn(`⚠️ Google Sheet webhook returned status ${res.status}: ${responseText.substring(0, 100)}`);
    }
  } catch (err) {
    console.error('⚠️ Failed to sync order to Google Sheet:', err.message);
  }
}

// List orders
app.get('/api/orders', (req, res) => {
  try {
    const rawOrders = db.prepare(`
      SELECT * FROM orders ORDER BY created_at DESC LIMIT 50
    `).all();

    const orders = rawOrders.map((order) => {
      let parsedItems = [];
      if (order.items_json) {
        try {
          parsedItems = JSON.parse(order.items_json);
        } catch {
          parsedItems = [];
        }
      }
      return {
        ...order,
        items: parsedItems
      };
    });

    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 UltraGlide backend running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
});
