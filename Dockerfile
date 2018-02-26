FROM nginx:alpine
COPY ./dist /opt/luna/
COPY ./i18n /opt/luna/i18n/
COPY nginx.conf /etc/nginx/conf.d/default.conf
