# The tag is updated by .github/workflows/build-base-image.yml.
FROM jumpserver/luna-base:20260806_071716 AS stage-build

ADD . /data

RUN pnpm generate \
    && mkdir -p dist/luna \
    && cp -a .output/public/. dist/luna/ \
    && rm -rf .output

FROM nginx:1.24-bullseye

COPY --from=stage-build /data/dist/luna /opt/luna
COPY nginx.conf /etc/nginx/conf.d/default.conf
