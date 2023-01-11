FROM node:16-slim

RUN apt-get update
RUN apt-get install -y openssl

WORKDIR /app
RUN ["chmod", "+x", "/usr/local/bin/docker-entrypoint.sh"]

COPY package.json ./
COPY package-lock.json ./
COPY .env ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3003

CMD node server.js