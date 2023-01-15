# base image
FROM node:18.12.1-alpine3.16

# create & set working directory
RUN mkdir -p /usr/src
WORKDIR /usr/src

# copy source files
COPY . /usr/src

COPY package*.json ./
COPY prisma ./prisma/

RUN apt-get -qy update
RUN apk add --update --no-cache openssl1.1-compat

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