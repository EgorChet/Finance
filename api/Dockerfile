FROM node:22-slim
WORKDIR /app
COPY api/package.json ./
RUN npm install
COPY api/tsconfig.json ./
COPY api/src ./src
COPY data/fixed_charges.json ./data/fixed_charges.json
COPY data/excluded_transactions.json ./data/excluded_transactions.json
RUN npm run build
ENV DATA_DIR=/app/data
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
