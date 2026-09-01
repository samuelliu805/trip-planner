FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV APP_REGION=cn
ENV AUTH_PROVIDER=cloudbase
ENV CLOUDBASE_ENV_ID=trip-planner-cn-dev-d3bz94038b26
ENV CLOUDBASE_PUBLISHABLE_KEY=build-placeholder
ENV CLOUDBASE_REGION=ap-shanghai
ENV DATA_PROVIDER=cloudbase
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_APP_REGION=cn
ENV NEXT_PUBLIC_CLOUDBASE_ENV_ID=trip-planner-cn-dev-d3bz94038b26
ENV NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLOUDBASE_REGION=ap-shanghai
ENV NEXT_PUBLIC_MAPS_PROVIDER=amap
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_TELEMETRY_ENABLED=false
ENV NEXT_PUBLIC_TELEMETRY_ENVIRONMENT=production
ENV STORAGE_PROVIDER=cloudbase
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN test -n "$NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY" \
  && test -n "$NEXT_PUBLIC_SITE_URL" \
  && npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
