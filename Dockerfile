#!/bin/sh

# docker build . -t pim/node-web-app --no-cache
# docker run -p 49160:3003 pim/node-web-app 

# Dockerfile for running Prisma on Linux Alpine 3.17+

FROM node:lts

# install OpenSSL 1.1.x, needed for Linux Alpine 3.17+
RUN apt-get update 
RUN apt-get upgrade

# create & set working directory
RUN mkdir -p /usr/src
WORKDIR /usr/src

# copy source files
COPY . /usr/src

COPY package*.json ./
COPY prisma ./prisma/

# Set env var
RUN PRISMA_CLI_BINARY_TARGETS=linux-arm64-openssl-1.1.x

# install dependencies
RUN npm install -g npm@latest
RUN npm install
RUN npm install @prisma/client

COPY . .
RUN npx prisma generate --schema ./prisma/schema.prisma
# start app
RUN npm run build
EXPOSE 3003
CMD npm run start