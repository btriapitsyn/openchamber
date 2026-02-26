FROM oven/bun:1.3.9 AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS builder
RUN bun run build:web

FROM oven/bun:1.3.9 AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV OPENCHAMBER_PORT=3000
ENV BUN_INSTALL=/home/bun/.bun
ENV PATH=${BUN_INSTALL}/bin:${PATH}

USER root

RUN apt-get update && apt-get install -y --no-install-recommends git npm openssh-client && rm -rf /var/lib/apt/lists/*

# 配置 npm 全局安装到用户可写目录
RUN npm config set prefix /home/bun/.npm-global && mkdir -p /home/bun/.npm-global

ENV NPM_CONFIG_PREFIX=/home/bun/.npm-global
ENV PATH=${NPM_CONFIG_PREFIX}/bin:${PATH}

# 确保 bun 用户对全局 npm 目录有写权限
RUN chown -R bun:bun /home/bun/.npm-global

USER bun

RUN npm install -g opencode-ai

RUN mkdir -p /home/bun/.local /home/bun/.config /home/bun/.ssh

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/web/package.json ./packages/web/package.json
COPY --from=builder /app/packages/web/bin ./packages/web/bin
COPY --from=builder /app/packages/web/server ./packages/web/server
COPY --from=builder /app/packages/web/dist ./packages/web/dist
COPY --chmod=755 scripts/docker-entrypoint.sh /app/openchamber-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/openchamber-entrypoint.sh"]
