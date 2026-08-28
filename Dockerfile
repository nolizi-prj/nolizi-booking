# Runs anywhere that runs a container. No provider-specific anything.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY core/package.json core/
COPY service/package.json service/
RUN npm install --ignore-scripts
COPY . .
RUN npm run build --workspaces

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/core ./core
COPY --from=build /app/service ./service
COPY --from=build /app/package.json ./
EXPOSE 8080
# Health is the process; readiness is migrations plus a database that answers.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "service/dist/server.js"]
