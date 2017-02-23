# ~*~ coding: utf-8 ~*~

import logging
import time

from flask import Flask
import socketio
from flask_socketio import SocketIO
from .conf import config
from .service import service


logger = logging.getLogger(__file__)


__version__ = '0.4.0'


class Luna(Flask):
    service = service
    clients = {}
    proxy_list = {}
    active = True

    def run(self, host=None, port=None, debug=None, **options):
        print(time.ctime())
        print('Luna version %s, more see https://www.jumpserver.org' % __version__)
        print('Starting ssh server at %(host)s:%(port)s' %
              {'host': self.config['BIND_HOST'],
               'port': self.config['LISTEN_PORT']})
        print('Quit the server with CONTROL-C.')

        return Flask.run(self, host=host, port=port, debug=debug, **options)

    def stop(self):
        self.active = False
        for i in Luna.clients:
            i.disconnect()
        socket_io.stop()

async_mode = 'threading'
app = Luna(__name__, template_folder='dist')
socket_io = SocketIO(app)
app.config.update(**config)
#socket_io = socketio.Server(logger=False, async_mode=async_mode)
#app.wsgi_app = socketio.Middleware(socket_io, app.wsgi_app)
