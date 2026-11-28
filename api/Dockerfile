FROM node:22-slim
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/tsconfig.json ./
COPY api/src ./src
# Budget/pace logic shared with the web app
COPY core /app/core
RUN npm run build
ENV DATA_DIR=/app/data
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/api/src/index.js"]
