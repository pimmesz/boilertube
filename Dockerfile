#!/bin/sh

# docker buildx build --load -f Dockerfile --platform=linux/amd64 . -t prisma-linux-node-alpine-3.17-x64
# docker buildx . -t pim/node-web-app --platform=linux/amd64 . 

# Dockerfile for running Prisma on Linux Alpine 3.17+

FROM node:lts

# install OpenSSL 1.1.x, needed for Linux Alpine 3.17+
RUN apk update 
RUN apk upgrade

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