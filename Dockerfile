# docker build . -t pim/node-web-app 
# docker run -p 49160:3003 -d pim/node-web-app

FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
# COPY dist ./

RUN apt-get update && apt-get install -y openssl libssl-dev
RUN npm install

# Bundle app source
COPY . .

RUN npm run build
RUN npx prisma db push --force-reset
# If you are building your code for production
# RUN npm ci --only=production

EXPOSE 3003
CMD [ "node", "server.js" ]