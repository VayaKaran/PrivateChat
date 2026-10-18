# Multi-Stage Dockerfile for PrivateChat Self-Hosted Messaging

# Stage 1: Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root workspace and package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install all dependencies including devDependencies for build
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/

# Build shared, server, and client
RUN npm run build

# Stage 2: Production runner
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

# Create data directory for SQLite database and uploads
RUN mkdir -p /app/data && chown -R node:node /app

# Copy built artifacts and production dependencies
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled bundles from builder stage
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Switch to non-root node user for security
USER node

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "server/dist/index.js"]
