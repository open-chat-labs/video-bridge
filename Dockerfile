# build stage
FROM node:20-alpine as build

WORKDIR /video_bridge

COPY package*.json .

RUN npm install

COPY . . 

RUN npm run build

# prod stage
FROM node:20-alpine

WORKDIR /video_bridge

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

COPY --from=build /video_bridge/dist ./dist

COPY package*.json  .

RUN npm install --only=production

RUN rm package*.json

EXPOSE 5050

CMD [ "node", "dist/main.js" ]