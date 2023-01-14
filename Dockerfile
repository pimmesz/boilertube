# docker build . -t pim/node-web-app 
# docker run -p 49160:3003 -d pim/node-web-app

FROM node:lts

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

RUN apt-get update && apt-get install -y openssl libssl-dev
RUN npm install

RUN npm run build
RUN npx prisma db push --force-reset

COPY . .

EXPOSE 3003
CMD [ "node", "server.js" ]