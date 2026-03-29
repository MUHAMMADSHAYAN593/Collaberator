FROM node:20-alpine as frontend-build

COPY ./Frontend/ /app

WORKDIR /app

RUN npm install

RUN npm run build

FROM node:20-alpine

COPY ./Backend/ /app

WORKDIR /app

RUN npm install

COPY --from=frontend-build /app/dist /app/public

CMD ["node", "server.js"]