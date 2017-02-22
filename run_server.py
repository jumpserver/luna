#!/usr/bin/env python
# ~*~ coding: utf-8 ~*~

from luna import app
import os


host = app.config['BIND_HOST']
port = app.config['LISTEN_PORT']


if __name__ == '__main__':
    try:
        os.mkdir('logs')
        os.mkdir('keys')
    except Exception:
        pass

    try:
        app.run(threaded=True, host=host, port=port)
    except KeyboardInterrupt:
        app.stop()

