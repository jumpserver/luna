FROM jumpserver/base-env-alpine:latest
MAINTAINER Jumpserver Team <ibuler@qq.com>

COPY . /opt/jumpserver-web-terminal
WORKDIR /opt/jumpserver-web-terminal

RUN pip install -r requirements.txt -i https://pypi.doubanio.com/simple
