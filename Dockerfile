# ─── 基础镜像：安装依赖 ─────────────────────────────────────────
FROM node:23-slim AS base

# 安装 pnpm
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

# 安装依赖
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

# ─── 构建阶段：Next.js 构建 ───────────────────────────────────────
FROM base AS builder

# 拷贝源码（排除 node_modules 避免覆盖已安装的依赖）
COPY app ./app
COPY components ./components
COPY public ./public
COPY service ./service
COPY *.ts *.tsx *.js *.mjs *.json ./
COPY tailwind.config.ts postcss.config.mjs next.config.mjs ./

# 执行 Next.js 构建
RUN pnpm run build

# ─── 运行阶段：Standalone 输出 ────────────────────────────────────
FROM node:23-slim AS runner

WORKDIR /app

# 生产环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 拷贝构建产物
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 开放端口
EXPOSE 3000

# 启动
CMD ["node", "server.js"]
