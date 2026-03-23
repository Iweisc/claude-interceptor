FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.js ./
COPY src ./src
EXPOSE 3985
CMD ["node", "index.js"]
