# The tag is updated by .github/workflows/build-base-image.yml.
FROM jumpserver/luna-base:20260826_080226 AS stage-build

ADD . /data

RUN pnpm generate

FROM nginx:1.24-bullseye

COPY --from=stage-build /data/.output/public /opt/luna
COPY nginx.conf /etc/nginx/conf.d/default.conf
