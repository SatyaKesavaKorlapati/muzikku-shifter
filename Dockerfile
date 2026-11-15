FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npx prisma generate && npm run build
ENV DATABASE_URL="file:/data/muzikku.db"
ENV APP_URL="http://localhost:3000"
EXPOSE 3000
CMD ["sh", "-c", "mkdir -p /data && npx prisma db push && npm start"]
