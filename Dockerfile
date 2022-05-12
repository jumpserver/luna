FROM node:10 as stage-build
ARG NPM_REGISTRY="https://registry.npm.taobao.org"
ENV NPM_REGISTY=$NPM_REGISTRY
ARG SASS_BINARY_SITE="https://npm.taobao.org/mirrors/node-sass"
ENV SASS_BINARY_SITE=$SASS_BINARY_SITE

WORKDIR /data

RUN npm config set sass_binary_site=${SASS_BINARY_SITE}
RUN npm config set registry ${NPM_REGISTRY}
COPY package.json package-lock.json /data/
RUN npm install
RUN npm rebuild node-sass

ARG VERSION
ENV VERSION=$VERSION
# Build
ADD . /data
RUN cd utils && ls .. && bash -ixeu build.sh build

FROM nginx:alpine
COPY --from=stage-build /data/release/luna /opt/luna/
COPY nginx.conf /etc/nginx/conf.d/default.conf
