FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV SEAPEDIA_HOST=0.0.0.0
ENV SEAPEDIA_PORT=8000
ENV SEAPEDIA_DATA_FILE=/data/seapedia-data.json

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY backend/src ./backend/src
COPY app/static ./app/static

EXPOSE 8000
CMD ["npm", "start"]
