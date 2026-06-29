# stage 1
FROM node:24-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .

RUN  npm run build
RUN npm prune --production
#stage 2
FROM node:24-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=builder /usr/src/app/package*.json /usr/src/app/
COPY --from=builder /usr/src/app/dist /usr/src/app/dist
COPY --from=builder /usr/src/app/drizzle.config.ts /usr/src/app/drizzle.config.ts

EXPOSE 8000
CMD [ "npm","run","start:prod" ]
