FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY dist ./dist
COPY server ./server
COPY scripts ./scripts
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 DATA_DIR=/app/data
EXPOSE 10000
CMD ["node", "scripts/serve.mjs"]
