FROM node:22-bookworm-slim

ARG TABYAGENT_VERSION=dev

WORKDIR /app
ENV TABYAGENT_VERSION=${TABYAGENT_VERSION}
RUN printf '%s\n' "${TABYAGENT_VERSION}" > /app/VERSION
LABEL org.opencontainers.image.version="${TABYAGENT_VERSION}"
ENV USER_DIR=/app/user
ENV WORKSPACE_DIR=/workspace
ENV APP_ROOT=/app
ENV CODES_DIR=/app/codes
ENV CONFIG_DIR=/app/codes/config
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV HEADLESS=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        ca-certificates \
        fonts-liberation \
        fonts-noto-cjk \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages 'browser-use' 'uv' \
    && browser-use install

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY codes ./codes

WORKDIR /app/codes/skills/playwright-cli
RUN npm install --omit=dev \
    && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 npx playwright install chromium
WORKDIR /app

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh codes/cli.js

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["start"]
