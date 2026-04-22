# ManabiOps - Cloud Run 向け Dockerfile
# 要件定義 第5章: サーバーレス(Cloud Run)アーキテクチャ
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:20-slim AS runtime
WORKDIR /app
# 顔ぼかし Python 依存 (FR-06, opencv + mediapipe)
# FFmpeg は動画処理用
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 python3-pip ffmpeg libgl1 \
  && rm -rf /var/lib/apt/lists/*
# Python deps はビルド時間が長いため、最小構成は requirements.txt に分離
COPY scripts/requirements.txt ./scripts/
RUN pip3 install --no-cache-dir --break-system-packages -r scripts/requirements.txt || true

ENV NODE_ENV=production
ENV PORT=8080
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
COPY scripts ./scripts

EXPOSE 8080
CMD ["node", "dist/index.js"]
