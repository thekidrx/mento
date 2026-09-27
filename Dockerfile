# Build the frontend
FROM node:22-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Server runtime
FROM node:22-bookworm-slim AS server
WORKDIR /app/server
COPY server/package*.json ./
# python3/make/g++: better-sqlite3 has no prebuilt binary for every
# arch/Node combo (e.g. Raspberry Pi's arm64), so it falls back to
# compiling from source via node-gyp, which needs these.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ tzdata \
  && rm -rf /var/lib/apt/lists/* \
  && npm ci --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
