# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
RUN npm ci

# Copy rest and build frontend
COPY . .
RUN npm run build

# --- Runtime stage ---
FROM node:20-alpine
WORKDIR /app

# Only install prod deps (Express etc.)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server and built frontend
COPY server.js ./
COPY --from=build /app/dist ./dist

EXPOSE 3001
CMD ["node", "server.js"]
