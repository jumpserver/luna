FROM node:10 as stage-build
WORKDIR /data
ADD . /data
RUN cd utils && bash -ix build.sh

FROM nginx:alpine
COPY --from=stage-build /data/release/luna /opt/luna/
COPY nginx.conf /etc/nginx/conf.d/default.conf
