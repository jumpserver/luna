#!/usr/bin/env python
# ~*~ coding: utf-8 ~*~

import os

from luna import app

os.environ.setdefault('LUNA_CONFIG_MODULE', 'luna.config')

host = app.config['BIND_HOST']
port = app.config['LISTEN_PORT']


if __name__ == '__main__':
    try:
        app.run(threaded=True, host=host, port=port)
    except KeyboardInterrupt:
        app.stop()

