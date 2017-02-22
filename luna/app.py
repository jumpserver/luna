# ~*~ coding: utf-8 ~*~

import logging
import time

from flask import Flask
import socketio
from jms import AppService, UserService
from jms.mixin import AppMixin
from .conf import config


logger = logging.getLogger(__file__)


__version__ = '0.4.0'


class Luna(Flask, AppMixin):
    app_service = None
    clients = {}

    def bootstrap(self):
        self.app_service = AppService(
            app_name=self.config['NAME'],
            endpoint=self.config['JUMPSERVER_ENDPOINT'])
        self.app_auth()
        while True:
            if self.check_auth():
                logging.info('App auth passed')
                break
            else:
                logging.warn('App auth failed, Access key error or need admin active it')
            time.sleep(5)

    def run(self, host=None, port=None, debug=None, **options):
        print(time.ctime())
        print('Luna version %s, more see https://www.jumpserver.org' % __version__)
        print('Starting ssh server at %(host)s:%(port)s' % {'host': self.config['BIND_HOST'],
                                                            'port': self.config['LISTEN_PORT']})
        print('Quit the server with CONTROL-C.')

        return Flask.run(self, host=host, port=port, debug=debug, **options)

    @classmethod
    def stop(cls):
        for i in cls.clients:
            i.disconnect()
        socket_io.stop()

async_mode = 'threading'
app = Luna(__name__, template_folder='dist')
app.config.update(**config)
socket_io = socketio.Server(logger=True, async_mode=async_mode)
app.wsgi_app = socketio.Middleware(socket_io, app.wsgi_app)
