FROM oven/bun:1.1.0-slim AS base

WORKDIR /app

# Copy workspace metadata
COPY package.json bun-workspace.yaml tsconfig.json ./
COPY bun.lock* ./

# Development target: Skip install, expects host node_modules via volume mount
FROM base AS dev

# Copy only this app and shared packages (dependencies come from host via volume mount at runtime)
COPY apps/trashed-app-mobile ./apps/trashed-app-mobile
COPY packages ./packages

WORKDIR /app/apps/trashed-app-mobile

EXPOSE 19000 19001 19002 19006

# Run Expo (web target) bound to all interfaces
# Use bunx instead of npx since we're in a Bun environment
CMD ["bunx", "expo", "start", "--web", "--host", "0.0.0.0", "--port", "19006", "--non-interactive"]

# Production target: Install dependencies and build
FROM base AS prod

# Create workspace directories before installing (bun needs them to exist)
RUN mkdir -p apps/trashed-app-mobile packages

# Install all workspace dependencies (skip postinstall scripts to avoid ngrok binary download issues)
RUN bun install --ignore-scripts

# Copy only this app and shared packages
COPY apps/trashed-app-mobile ./apps/trashed-app-mobile
COPY packages ./packages

WORKDIR /app/apps/trashed-app-mobile

EXPOSE 19000 19001 19002 19006

# Production build would go here if needed
CMD ["bunx", "expo", "start", "--web", "--host", "0.0.0.0", "--port", "19006", "--non-interactive"]
