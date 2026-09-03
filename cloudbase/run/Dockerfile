FROM node:24-bookworm-slim AS sharp-vendor
RUN npm install --ignore-scripts --no-audit --no-fund --prefix /vendor \
  @img/sharp-libvips-linux-x64@1.2.4

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
COPY --from=sharp-vendor --chown=nextjs:nodejs \
  /vendor/node_modules/@img/sharp-libvips-linux-x64 \
  ./node_modules/@img/sharp-libvips-linux-x64
USER nextjs
EXPOSE 8080
CMD ["node", "cloudbase-runtime-entrypoint.mjs"]
