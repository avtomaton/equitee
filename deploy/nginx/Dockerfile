# ── Multi-stage nginx build ───────────────────────────────────────
# Stage 1: Build the React frontend
# Stage 2: nginx serves landing page + frontend SPA + proxies API

# ---- Stage 1: Frontend build ----
FROM node:20-alpine AS frontend-build

WORKDIR /app

COPY frontend/package-lock.json frontend/package.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# ---- Stage 2: nginx ----
FROM nginx:alpine

# Copy built frontend assets
COPY --from=frontend-build /app/dist /var/www/frontend

# Copy landing page
COPY landing/ /var/www/landing

# Copy nginx configuration
COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf

# Default to production vhosts; override in docker-compose for dev
ARG VHOST=production.conf
COPY deploy/nginx/vhosts/${VHOST} /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
