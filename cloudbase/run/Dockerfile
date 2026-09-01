FROM node:24-bookworm-slim
WORKDIR /app
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --chown=nextjs:nodejs . .
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
