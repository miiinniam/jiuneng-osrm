# 🌐 OSRM++ Frontend Dockerfile — Next.js 前端
# 开发模式：热重载，绑定挂载源码目录
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 47820

CMD ["npm", "run", "dev"]
