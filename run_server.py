#!/usr/bin/env python
# ~*~ coding: utf-8 ~*~

import sys
import os

from luna import app, socket_io
from luna.tasks import command_task, record_task

host = app.config['BIND_HOST']
port = app.config['LISTEN_PORT']


if __name__ == '__main__':
    try:
        os.mkdir('logs')
        os.mkdir('keys')
    except Exception:
        pass

    try:
        command_task.run()
        record_task.run()
        app.bootstrap()
        socket_io.run(app)
        # app.run(threaded=True, host=host, port=port)
    except KeyboardInterrupt:
        app.stop()
        sys.exit()

