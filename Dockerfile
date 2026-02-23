FROM node:20-alpine

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

RUN npm prune --production

EXPOSE 3000

CMD ["node", "dist/app.js"]
