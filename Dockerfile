FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3 native bindings
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Ensure data directory exists for persistent SQLite database
RUN mkdir -p /app/data

EXPOSE 5001

ENV NODE_ENV=production
ENV DB_PATH=/app/data/orders.db

CMD ["npm", "start"]
