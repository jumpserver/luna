FROM node:10 as stage-build
ARG VERSION
ENV VERSION=$VERSION
WORKDIR /data
ADD . /data
RUN cd utils && bash -ixeu build.sh

FROM nginx:alpine
COPY --from=stage-build /data/release/luna /opt/luna/
COPY nginx.conf /etc/nginx/conf.d/default.conf
