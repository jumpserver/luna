FROM node:22-bookworm-slim AS stage-build

WORKDIR /data

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    HUSKY=0

RUN npm install --global pnpm@11.4.0

COPY . .

RUN pnpm --filter jumpserver-client... install --frozen-lockfile \
    && pnpm --filter jumpserver-client generate \
    && cp -r /data/.output/public /opt/luna
