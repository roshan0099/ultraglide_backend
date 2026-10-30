# AWS Lambda Deployment Guide for UltraGlide Backend

Your backend has been restructured into a **dual-mode architecture**:
- **Local Development**: `node server.js` runs a standalone Express server on port 5001 as usual.
- **AWS Lambda**: `lambda.js` exports an optimized AWS Lambda handler using `@codegenie/serverless-express`.

---

## Architecture Overview

| File | Purpose |
| :--- | :--- |
| [`app.js`](file:///Users/mroshank/Desktop/void/ultraglide-backend/app.js) | Core Express app with all routes, Razorpay logic, price validation, and Google Sheet sync. |
| [`server.js`](file:///Users/mroshank/Desktop/void/ultraglide-backend/server.js) | Local server runner (`app.listen(PORT)`). Used for local pair programming & frontend dev. |
| [`lambda.js`](file:///Users/mroshank/Desktop/void/ultraglide-backend/lambda.js) | AWS Lambda entrypoint (`export const handler = serverlessExpress({ app })`). |
| [`serverless.yml`](file:///Users/mroshank/Desktop/void/ultraglide-backend/serverless.yml) | 1-command deployment configuration for Serverless Framework. |

---

## Important: Zero-Fuss Serverless Operation (No SQLite in Lambda)

* **SQLite is Completely Skipped in Lambda**: To eliminate any risk of native C++ binary mismatches (`better-sqlite3`) or read-only filesystem errors, the backend detects AWS Lambda and skips SQLite entirely.
* **Pure JavaScript Runtime**: The Lambda function runs 100% lightweight JavaScript.
* **Persistent Order Storage via Google Sheets**: Every order (COD or Razorpay) and verified payment is immediately pushed to your **Google Sheet dashboard webhook** (`GOOGLE_SHEET_WEBHOOK_URL`), so your order records are safe, permanent, and easily viewable in Google Sheets.
* **Local Development Untouched**: When running locally via `node server.js`, SQLite (`orders.db`) continues to work as usual.

---

## Recommended: Deploying via Amazon S3

Deploying via S3 is the industry standard because it avoids browser upload size limits and gives you a versioned backup of your deployment packages.

### Step 1: Build the Zip Package
Run the npm script we configured:
```bash
cd /Users/mroshank/Desktop/void/ultraglide-backend
npm run build:zip
```
This generates `ultraglide-lambda.zip` (~4.8 MB) containing only the pure JavaScript runtime.

### Step 2: Upload to Amazon S3
You can upload via AWS Console or AWS CLI:

* **Via AWS S3 Console**:
  1. Open [Amazon S3 Console](https://s3.console.aws.amazon.com/s3/).
  2. Choose your bucket (or create a new one, e.g., `my-ultraglide-deployments`).
  3. Click **Upload** → drag and drop `ultraglide-lambda.zip` → click **Upload**.
  4. Click on the uploaded file and copy its **S3 URI** (e.g., `s3://my-ultraglide-deployments/ultraglide-lambda.zip`) or **Object URL** (`https://my-ultraglide-deployments.s3.ap-south-1.amazonaws.com/ultraglide-lambda.zip`).

* **Via AWS CLI (1 line)**:
  ```bash
  aws s3 cp ultraglide-lambda.zip s3://YOUR_BUCKET_NAME/ultraglide-lambda.zip
  ```

### Step 3: Deploy to Lambda from S3
1. In the **AWS Lambda Console** → select your function `ultraglide-backend`.
2. In the **Code Source** panel, click **Upload from** → **Amazon S3 location**.
3. Paste your S3 Object URL or S3 link.
4. Click **Save**. AWS Lambda will pull the code instantly from S3!

### Step 4: Verify Handler
Ensure the handler under **Runtime settings** is set to:
```
lambda.handler
```

### Step 4: Enable Free Lambda Function URL
1. Click the **Configuration** tab → **Function URL** → **Create function URL**.
2. Set:
   - **Auth type**: `NONE` (public endpoint for your storefront)
   - **Configure cross-origin resource sharing (CORS)**: Check this box!
   - **Allow origin**: `*` (or your domain, e.g. `https://ultraglide.in`)
   - **Allow headers**: `content-type, authorization`
   - **Allow methods**: `GET, POST, OPTIONS`
3. Click **Save**. Copy the generated URL (e.g. `https://xxxx.lambda-url.ap-south-1.on.aws/`).

### Step 5: Configure Environment Variables
In the **Configuration** tab → **Environment variables** → **Edit**:
* `RAZORPAY_KEY_ID`: `rzp_live_...`
* `RAZORPAY_KEY_SECRET`: `...`
* `GOOGLE_SHEET_WEBHOOK_URL`: `https://script.google.com/macros/s/.../exec`
* `FRONTEND_URL`: `*` (or your production frontend URL)

---

## Deployment Option 2: 1-Command CLI Deployment (Serverless Framework)

If you have the AWS CLI configured:
```bash
cd /Users/mroshank/Desktop/void/ultraglide-backend
npx serverless deploy
```
This automatically packages the project, provisions the Lambda function and HTTP API, sets permissions, and prints your live public URL!

---

## Step 6: Connect Frontend to Lambda URL

In your frontend project (`ultraglide/.env` or deployment settings):
```env
VITE_BACKEND_URL=https://your-lambda-url.on.aws
```
All API requests (`/api/health`, `/api/create-order`, `/api/verify-payment`, `/api/orders`) will now execute on AWS Lambda!
