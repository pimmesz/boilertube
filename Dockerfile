#!/bin/sh

# docker buildx build --load -f Dockerfile --platform=linux/amd64 . -t prisma-linux-node-alpine-3.17-x64
# docker buildx . -t pim/node-web-app --platform=linux/amd64 . 

# Dockerfile for running Prisma on Linux Alpine 3.17+

# change with the Node.js version of your choice
ARG NODE_VERSION="18.12.1"

# change with the Linux Alpine version of your choice
ARG ALPINE_VERSION="3.17"

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base

# install OpenSSL 1.1.x, needed for Linux Alpine 3.17+
RUN apk update 
RUN apk upgrade
RUN apk add openssl1.1-compat

# create & set working directory
RUN mkdir -p /usr/src
WORKDIR /usr/src

# copy source files
COPY . /usr/src

COPY package*.json ./
COPY prisma ./prisma/

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