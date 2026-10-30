# Lightweight Lambda Web Function Dockerfile
# Optimized for AWS Lambda Web Functions — no native SQLite bindings needed
FROM node:24-slim

WORKDIR /app

COPY package*.json ./

# Only install production JS deps — skip optional native modules (better-sqlite3)
RUN npm install --omit=dev --ignore-scripts && \
    rm -rf node_modules/better-sqlite3 node_modules/.cache

COPY index.js app.js ./

ENV NODE_ENV=production
ENV IS_LAMBDA=true

# Lambda Web Functions expect the app on port from AWS_LAMBDA_HTTP_ENDPOINT
CMD ["node", "index.js"]
