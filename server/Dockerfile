FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm install --omit=dev
COPY server/src ./src
COPY site/assets/sim.js ./sim.js
COPY site/assets/content.json ./content.json
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/index.js"]
