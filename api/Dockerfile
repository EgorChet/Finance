FROM mcr.microsoft.com/playwright:v1.49.0-noble
WORKDIR /app
COPY api/package.json ./
RUN npm install
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build
ENV DATA_DIR=/app/data
ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
EXPOSE 3000
CMD ["node", "dist/index.js"]
