# Build stage
FROM node:18 AS builder

WORKDIR /app

# Copy CPQ12 files
COPY CPQ12/package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY CPQ12 .

# Build frontend
RUN npm run build 2>/dev/null || echo "Frontend build skipped"

# Runtime stage
FROM node:18

WORKDIR /app

# Copy from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY CPQ12/package.json ./
COPY CPQ12/package-lock.json ./
COPY CPQ12/server.cjs ./
COPY CPQ12 ./CPQ12

# Expose ports
EXPOSE 3000 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Start app
CMD ["node", "server.cjs"]
