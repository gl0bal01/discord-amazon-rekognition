FROM node:22-alpine@sha256:8094c002d08262dba12645a3b4a15cd6cd627d30bc782f53229a2ec13ee22a00 AS deps

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

FROM node:22-alpine@sha256:8094c002d08262dba12645a3b4a15cd6cd627d30bc782f53229a2ec13ee22a00 AS runtime

RUN apk add --no-cache tini
RUN addgroup -S bot && adduser -S bot -G bot

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json index.js deploy-commands.js ./
COPY commands/ commands/

RUN mkdir -p temp && chown bot:bot temp && chmod 700 temp

LABEL org.opencontainers.image.source="https://github.com/gl0bal01/discord-amazon-rekognition"
LABEL org.opencontainers.image.description="Discord bot with AWS Rekognition integration"
LABEL org.opencontainers.image.licenses="MIT"

USER bot

STOPSIGNAL SIGTERM
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
