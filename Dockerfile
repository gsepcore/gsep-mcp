FROM node:20-alpine

# Build tools required for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

# Install GSEP-MCP globally (pre-built, no runtime download)
RUN npm install -g @gsep/mcp

ENV GSEP_HTTP_HOST=0.0.0.0
ENV GSEP_TRANSPORT=http
ENV GSEP_PRESET=full

EXPOSE 3100

CMD sh -c "GSEP_HTTP_PORT=${PORT:-3100} gsep-mcp --http"
