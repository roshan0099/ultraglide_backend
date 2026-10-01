// Quick test script for Google Sheet Webhook
import dotenv from 'dotenv';
dotenv.config();

const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;

console.log('Testing Webhook URL:', webhookUrl);

if (!webhookUrl) {
  console.error('❌ GOOGLE_SHEET_WEBHOOK_URL is not set in .env');
  process.exit(1);
}

const testPayload = {
  timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  orderId: `TEST_${Date.now()}`,
  paymentId: 'pay_test_ping',
  customerName: 'Test Order Ping',
  phone: '9876543210',
  email: 'test@example.com',
  address: 'Test Address, Thrissur, Kerala',
  items: 'Chain Lube (500ml) x 1',
  quantity: 1,
  amount: '₹449.00',
  status: 'PAID'
};

try {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload),
    redirect: 'follow'
  });

  const body = await res.text();
  console.log(`HTTP Status: ${res.status}`);
  console.log('Response body:\n', body.substring(0, 300));

  if (body.includes('"status":"success"') || body.includes('success')) {
    console.log('\n✅ SUCCESS! Webhook is live and a new row should be in your Google Sheet!');
  } else if (body.includes('Page not found') || body.includes('unable to open')) {
    console.log('\n❌ URL NOT FOUND: The deployment URL is either outdated or incomplete.');
    console.log('👉 In Apps Script, click: Deploy -> New deployment -> Web app -> Anyone -> Deploy, and copy the new URL.');
  } else if (body.includes('You need access')) {
    console.log('\n❌ ACCESS DENIED: The deployment is still set to "Only myself". Change to "Anyone".');
  }
} catch (err) {
  console.error('❌ Request failed:', err.message);
}
