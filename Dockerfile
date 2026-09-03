FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
RUN APP_REGION=cn \
  AUTH_PROVIDER=cloudbase \
  CLOUDBASE_ENV_ID=trip-planner-cn-dev-d3bz94038b26 \
  CLOUDBASE_PUBLISHABLE_KEY=__TRIP_PLANNER_CLOUDBASE_SERVER_KEY__ \
  CLOUDBASE_REGION=ap-shanghai \
  DATA_PROVIDER=cloudbase \
  NEXT_PUBLIC_AMAP_JS_API_KEY=__TRIP_PLANNER_AMAP_JS_API_KEY__ \
  NEXT_PUBLIC_APP_REGION=cn \
  NEXT_PUBLIC_CLOUDBASE_ENV_ID=trip-planner-cn-dev-d3bz94038b26 \
  NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY=__TRIP_PLANNER_CLOUDBASE_PUBLIC_KEY__ \
  NEXT_PUBLIC_CLOUDBASE_REGION=ap-shanghai \
  NEXT_PUBLIC_MAPS_PROVIDER=amap \
  NEXT_PUBLIC_SITE_URL=__TRIP_PLANNER_SITE_URL__ \
  NEXT_PUBLIC_TELEMETRY_ENABLED=false \
  NEXT_PUBLIC_TELEMETRY_ENVIRONMENT=production \
  STORAGE_PROVIDER=cloudbase \
  npm run build

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
COPY --from=build --chown=nextjs:nodejs /app/scripts/cloudbase-runtime-entrypoint.mjs ./cloudbase-runtime-entrypoint.mjs
USER nextjs
EXPOSE 8080
CMD ["node", "cloudbase-runtime-entrypoint.mjs"]
