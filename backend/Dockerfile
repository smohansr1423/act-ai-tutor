FROM node:20-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ .
RUN npm run build
RUN npm prune --production

EXPOSE 3000

CMD ["node", "dist/server.js"]
