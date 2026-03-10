FROM node:lts-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY js/ ./js/

EXPOSE 3000

CMD ["node", "server.js"]
