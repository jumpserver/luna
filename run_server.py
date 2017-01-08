#!/usr/bin/env python
# ~*~ coding: utf-8 ~*~


from config import Config
from luna import app
import subprocess

app.config.from_object(Config)
host = app.config['BIND_HOST']
port = app.config['LISTEN_PORT']

if __name__ == '__main__':
    subprocess.call('gunicorn -k eventlet -b %s:%s -w 4 -n luna run_server:app' % (host, port), shell=True)
