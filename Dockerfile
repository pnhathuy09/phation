# Phation MCP server (stdio). Used by Glama and other MCP hosts to build and inspect the server.
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY . .
ENV NODE_ENV=production
ENTRYPOINT ["node", "bin/server.mjs"]
