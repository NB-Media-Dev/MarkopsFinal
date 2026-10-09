FROM node:20-alpine AS base

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev || npm install --omit=dev
RUN npx prisma generate --schema=prisma/schema.prisma || true

COPY . .

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "server/index.js"]
