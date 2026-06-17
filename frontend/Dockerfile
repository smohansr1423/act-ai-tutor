FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve@14
COPY public/ ./public/
EXPOSE 3001
CMD ["serve", "public", "-s", "-l", "tcp://0.0.0.0:3001"]
