# Runs anywhere that runs a container. No provider-specific anything.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/service/package.json apps/service/
RUN npm ci
COPY . .
RUN npm run build --workspaces --if-present

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps
COPY --from=build /app/package.json ./
EXPOSE 8080
# Health is the process; readiness is migrations plus a database that answers.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/service/dist/server.js"]
