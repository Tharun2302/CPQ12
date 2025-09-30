# Multi-stage build for production
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install
# Copy source code
COPY . .

# Build the React app
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install LibreOffice and other system dependencies
RUN apk add --no-cache \
    libreoffice \
    python3 \
    py3-pip \
    wget \
    curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --production && npm cache clean --force
# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.cjs ./
COPY --from=builder /app/seed-templates.cjs ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S cpq -u 1001

# Create temp directories
RUN mkdir -p /temp/input /temp/output && \
    chown -R cpq:nodejs /temp && \
    chown -R cpq:nodejs /app

# Switch to non-root user
USER cpq

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# Start the application
CMD ["node", "server.cjs"]