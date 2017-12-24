FROM nginx:alpine
COPY ./dist /opt/luna/
COPY nginx.conf /etc/nginx/conf.d/default.conf
