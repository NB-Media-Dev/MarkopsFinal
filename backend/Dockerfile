# -------------------------------------------------------------
# Dockerfile for MarkOps Backend Node.js Service
# -------------------------------------------------------------
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies needed for native modules & prisma
RUN apk add --no-cache openssl libc6-compat

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate prisma client
RUN npm ci --omit=dev || npm install --omit=dev
RUN npx prisma generate --schema=prisma/schema.prisma || true

# Copy backend source code
COPY . .

# Set default production environment
ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "server/index.js"]
