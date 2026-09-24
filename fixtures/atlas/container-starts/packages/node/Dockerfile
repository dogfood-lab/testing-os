FROM node:22-slim AS builder
WORKDIR /build
COPY package.json pnpm-workspace.yaml ./
COPY packages/ packages/
RUN pnpm -r build

FROM node:22-slim AS production
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY --from=builder /build/packages/node/dist packages/node/dist
HEALTHCHECK --interval=15s CMD node -e "process.exit(0)"
CMD ["node", "packages/node/dist/main.js"]
