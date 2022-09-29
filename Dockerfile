FROM node:14.16 as stage-build
ARG TARGETARCH
ARG VERSION
ENV VERSION=$VERSION
ARG NPM_REGISTRY="https://registry.npmmirror.com"
ENV NPM_REGISTY=$NPM_REGISTRY

WORKDIR /data

RUN set -ex \
    && npm config set registry ${NPM_REGISTRY} \
    && yarn config set registry ${NPM_REGISTRY} \
    && yarn config set cache-folder /root/.cache/yarn/luna

ADD . /data
RUN RUN --mount=type=cache,target=/root/.cache/yarn \
    yarn install && cd utils && bash -xieu build.sh build

FROM nginx:alpine
COPY --from=stage-build /data/release/luna /opt/luna/
COPY nginx.conf /etc/nginx/conf.d/default.conf
