FROM node as stage-build
ADD . /data
WORKDIR /data
RUN npm i
RUN npm run-script build


FROM nginx:alpine
COPY --from=stage-build /data/dist /opt/luna/
COPY --from=state-build /data/luna/i18n /opt/luna/i18n/
COPY nginx.conf /etc/nginx/conf.d/default.conf
