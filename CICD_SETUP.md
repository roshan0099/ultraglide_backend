# 🚀 CI/CD Setup Guide — OIDC Federation

This guide walks you through the **one-time AWS setup** for the GitHub Actions CI/CD pipeline.
Zero stored credentials. Zero keys to rotate. Modern & secure.

---

## How It Works

```
Push to main → GitHub Actions → Gets OIDC token → AWS trusts GitHub →
Assumes IAM Role → Builds ZIP → Uploads to S3 → Updates Lambda ✅
```

---

## Step 1: Add GitHub as an Identity Provider in AWS

1. Go to **AWS Console** → **IAM** → **Identity providers** → **Add provider**
2. Fill in:
   - **Provider type**: `OpenID Connect`
   - **Provider URL**: `https://token.actions.githubusercontent.com`
   - Click **"Get thumbprint"**
   - **Audience**: `sts.amazonaws.com`
3. Click **Add provider**

---

## Step 2: Create an IAM Role for GitHub Actions

1. Go to **IAM** → **Roles** → **Create role**
2. **Trusted entity type**: `Web identity`
3. **Identity provider**: Select `token.actions.githubusercontent.com`
4. **Audience**: `sts.amazonaws.com`
5. Click **Next**
6. **Skip adding policies for now** (we'll add an inline policy)
7. **Role name**: `github-actions-ultraglide-deploy`
8. Click **Create role**

### Add the Trust Policy (edit after creation)

Go to the role → **Trust relationships** → **Edit trust policy** → paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:roshan0099/ultraglide_backend:*"
        }
      }
    }
```

> ⚠️ Replace `YOUR_AWS_ACCOUNT_ID` with your actual 12-digit AWS account ID.

### Add Permissions Policy

Go to the role → **Permissions** → **Add permissions** → **Create inline policy** → **JSON** tab → paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Deploy",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadBucket",
        "s3:CreateBucket"
      ],
      "Resource": [
        "arn:aws:s3:::ultraglide-lambda-deployments",
        "arn:aws:s3:::ultraglide-lambda-deployments/*"
      ]
    },
    {
      "Sid": "LambdaDeploy",
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration"
      ],
      "Resource": "arn:aws:lambda:us-east-1:*:function:razor-back"
    }
  ]
}
```

Name it `ultraglide-deploy-policy` and save.

---

## Step 3: Add the Role ARN to GitHub Secrets

1. Copy the **Role ARN** from the role summary page (looks like `arn:aws:iam::123456789012:role/github-actions-ultraglide-deploy`)
2. Go to **GitHub** → `roshan0099/ultraglide_backend` → **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**:
   - **Name**: `AWS_ROLE_ARN`
   - **Value**: paste the Role ARN

---

## Step 4: Push & Deploy! 🎉

```bash
cd /Users/mroshank/Desktop/void/ultraglide-backend
git add .
git commit -m "add OIDC CI/CD pipeline"
git push origin main
```

Go to **GitHub** → **Actions** tab to watch the deployment run.

---

## Manual Trigger

You can also deploy manually anytime:
- Go to **Actions** → **Deploy to Lambda** → **Run workflow** → **Run workflow**

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Check the trust policy has your correct AWS account ID and repo name |
| `AccessDenied` on S3 | Check the permissions policy has the correct bucket name |
| `ResourceNotFoundException` on Lambda | Check the function name is `razor-back` in `us-east-1` |
| `Error: Could not assume role` | Make sure the GitHub OIDC provider is added in IAM |
