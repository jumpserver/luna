FROM node:14.16 as stage-build
ARG TARGETARCH
ARG NPM_REGISTRY="https://registry.npmmirror.com"
ENV NPM_REGISTY=$NPM_REGISTRY

WORKDIR /data

RUN set -ex \
    && npm config set registry ${NPM_REGISTRY} \
    && yarn config set registry ${NPM_REGISTRY} \
    && yarn config set cache-folder /root/.cache/yarn/luna

ADD package.json package-lock.json yarn.lock /data
RUN --mount=type=cache,target=/root/.cache/yarn \
    yarn install

ARG VERSION
ENV VERSION=$VERSION
ADD . /data
RUN --mount=type=cache,target=/root/.cache/yarn \
    sed -i "s@[0-9].[0-9].[0-9]@${VERSION}@g" src/environments/environment.prod.ts \
    && yarn build \
    && cp -R src/assets/i18n luna/

FROM nginx:alpine
COPY --from=stage-build /data/luna /opt/luna
COPY nginx.conf /etc/nginx/conf.d/default.conf
