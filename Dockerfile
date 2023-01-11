FROM node:16-slim

RUN apt-get update
RUN apt-get install -y openssl

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 8080

CMD node app.js