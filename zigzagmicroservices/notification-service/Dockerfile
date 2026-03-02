# Production: build and run compiled JS
FROM node:18-alpine

WORKDIR /app

# NODE_ENV is set by docker-compose (production) or docker-compose.dev.yml (development)
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["npm", "start"]
