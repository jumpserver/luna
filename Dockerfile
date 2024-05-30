FROM node:16.20-bullseye-slim as stage-build
ARG TARGETARCH
ARG NPM_REGISTRY="https://registry.npmmirror.com"

RUN set -ex \
    && npm config set registry ${NPM_REGISTRY} \
    && yarn config set registry ${NPM_REGISTRY}

WORKDIR /data

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked,id=luna \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=yarn.lock,target=yarn.lock \
    yarn install

ARG VERSION
ENV VERSION=$VERSION

ADD . /data

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked,id=luna \
    sed -i "s@version =.*;@version = '${VERSION}';@g" src/environments/environment.prod.ts \
    && yarn build \
    && cp -R src/assets/i18n luna/

FROM nginx:1.24-bullseye
COPY --from=stage-build /data/luna /opt/luna
COPY nginx.conf /etc/nginx/conf.d/default.conf
