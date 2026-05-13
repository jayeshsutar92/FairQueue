FROM node:20-alpine
WORKDIR /code
COPY package.json yarn.lock* ./
RUN yarn install
COPY . .
EXPOSE 3000
CMD ["yarn", "dev"]
