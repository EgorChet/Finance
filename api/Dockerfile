FROM node:22-slim
WORKDIR /app/api
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY api/package.json api/package-lock.json ./
RUN npm ci
# Chromium for Cal sync. The browser is headless; the sync presents a normal Mac Chrome identity.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium
COPY api/tsconfig.json ./
COPY api/src ./src
# Budget/pace logic shared with the web app
COPY core /app/core
RUN npm run build
ENV DATA_DIR=/app/data
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/api/src/index.js"]
