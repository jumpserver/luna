#!/usr/bin/env python
# ~*~ coding: utf-8 ~*~

import sys
import os

from luna import app, socket_io

host = app.config['BIND_HOST']
port = app.config['LISTEN_PORT']


if __name__ == '__main__':
    try:
        os.mkdir('logs')
        os.mkdir('keys')
    except Exception:
        pass

    try:
        socket_io.run(app)
        # app.run(threaded=True, host=host, port=port)
    except KeyboardInterrupt:
        app.stop()
        sys.exit()

