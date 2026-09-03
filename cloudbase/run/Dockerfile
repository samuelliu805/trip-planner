FROM node:24-bookworm-slim AS dependencies
WORKDIR /vendor
COPY package.json package-lock.json cloudbase-runtime-node-modules.txt ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && mkdir /runtime-node_modules \
  && tar --create --file=/tmp/runtime-node-modules.tar \
    --directory=/vendor/node_modules \
    --verbatim-files-from \
    --no-recursion \
    --files-from=/vendor/cloudbase-runtime-node-modules.txt \
  && tar --extract --file=/tmp/runtime-node-modules.tar --directory=/runtime-node_modules

FROM node:24-bookworm-slim
WORKDIR /app
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV CN_PUBLIC_PHONE_AUTH_ENABLED=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --chown=nextjs:nodejs . .
COPY --from=dependencies --chown=nextjs:nodejs /runtime-node_modules ./node_modules
USER nextjs
EXPOSE 8080
CMD ["node", "cloudbase-runtime-entrypoint.mjs"]
