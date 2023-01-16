#!/bin/sh

# docker build . -t pim/node-web-app --no-cache
# docker run -p 49160:3003 pim/node-web-app 

FROM node:lts

RUN apt-get update 
RUN apt-get upgrade

# create & set working directory
WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

# Set env var
RUN PRISMA_CLI_BINARY_TARGETS=linux-arm64-openssl-1.1.x

# install dependencies
RUN npm install

COPY . .
RUN npx prisma generate --schema ./prisma/schema.prisma
# start app
RUN npm run build
EXPOSE 3003
CMD npm run start