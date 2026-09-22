# build stage
FROM node:22-alpine AS build

WORKDIR /video_bridge

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# prod stage
FROM node:22-alpine

WORKDIR /video_bridge

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force && rm package*.json

COPY --from=build /video_bridge/dist ./dist

USER node

EXPOSE 5050

CMD [ "node", "dist/main.js" ]
