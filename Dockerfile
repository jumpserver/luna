FROM node:10 as stage-build
WORKDIR /data
ADD ./package.json /data/package.json
ADD ./package-lock.json /data/package-lock.json
RUN npm i
ADD . /data
RUN npm run-script build


FROM nginx:alpine
COPY --from=stage-build /data/dist /opt/luna/
COPY i18n /opt/luna/i18n
COPY nginx.conf /etc/nginx/conf.d/default.conf
