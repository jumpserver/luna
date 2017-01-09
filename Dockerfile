FROM jumpserver/base-env-alpine:latest
MAINTAINER Jumpserver Team <ibuler@qq.com>

COPY . /opt/jumpserver-web-terminal
WORKDIR /opt/jumpserver-web-terminal

RUN pip install -r requirements.txt -i https://pypi.doubanio.com/simple
EXPOSE 5000
ENV JUMPSERVER_ENDPOINT ''
ENV LUNA_ACCESS_KEY ''
ENV ACCESS_KEY_ENV ''
ENV ACCESS_KEY_STORE ''
CMD python run_server.py