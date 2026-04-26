# =============================================================================
# Multi-stage Dockerfile for Express.js + TypeScript Application
# Optimized for production with minimal image size and security best practices
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies - Install all dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Copy only package files first to leverage Docker layer caching
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 2: Builder - Compile TypeScript to JavaScript
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

# Build the TypeScript application
RUN npm run build && \
    # Remove devDependencies after build
    npm prune --production && \
    npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 3: Production - Minimal runtime image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 expressapp

WORKDIR /app

# Set production environment
ENV NODE_ENV=production \
    PORT=3000

# Copy only necessary files from builder
COPY --from=builder --chown=expressapp:nodejs /app/dist ./dist
COPY --from=builder --chown=expressapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=expressapp:nodejs /app/package.json ./

# Switch to non-root user
USER expressapp

# Expose the application port
EXPOSE 3000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/server.js"]
