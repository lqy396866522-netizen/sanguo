# 构建上下文为仓库根目录：服务端编译时需要引用 assets/scripts/core 的战斗逻辑
FROM node:22-alpine AS build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
COPY assets/scripts/core /app/assets/scripts/core
COPY assets/scripts/data/PlayerDataManager.ts assets/scripts/data/IDataRepository.ts /app/assets/scripts/data/
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production TZ=Asia/Shanghai
RUN apk add --no-cache tzdata openssl
WORKDIR /app/server
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/prisma ./prisma
COPY --from=build /app/server/package.json ./
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server/src/main.js"]
