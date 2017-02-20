# ~*~ coding: utf-8 ~*~

import os
import logging
import time

from flask import Flask
import socketio
from jms import AppService, UserService
from jms.mixin import AppMixin

from . import BASE_DIR

__version__ = '0.4.0'


class Luna(Flask, AppMixin):
    default_config = dict(Flask.default_config)
    default_config.update({
        'NAME': 'luna',
        'BIND_HOST': '0.0.0.0',
        'LISTEN_PORT': 5000,
        'JUMPSERVER_ENDPOINT': os.environ.get('JUMPSERVER_ENDPOINT') or 'http://localhost:8080',
        'ACCESS_KEY': None,
        'SECRET_KEY': 'Keep_secret!!',
        'ACCESS_KEY_ENV': 'LUNA_ACCESS_KEY',
        'ACCESS_KEY_STORE': os.path.join(BASE_DIR, 'keys', '.access_key'),
        'LOG_LEVEL': 'DEBUG',
        'LOG_DIR': os.path.join(BASE_DIR, 'logs'),
        'ASSET_LIST_SORT_BY': 'ip',
        'HEATBEAT_INTERVAL': 5,
    })
    app_service = None

    def bootstrap(self):
        self.app_service = AppService(app_name=self.config['NAME'],
                                      endpoint=self.config['JUMPSERVER_ENDPOINT'])
        self.app_auth()
        while True:
            if self.check_auth():
                logging.info('App auth passed')
                break
            else:
                logging.warn('App auth failed, Access key error or need admin active it')
            time.sleep(5)
        self.heatbeat()

    def run(self, host=None, port=None, debug=None, **options):
        # self.bootstrap()
        print(time.ctime())
        print('Luna version %s, more see https://www.jumpserver.org' % __version__)
        print('Starting ssh server at %(host)s:%(port)s' % {'host': self.config['BIND_HOST'],
                                                            'port': self.config['LISTEN_PORT']})
        print('Quit the server with CONTROL-C.')

        return Flask.run(self, host=host, port=port, debug=debug, **options)

async_mode = None
app = Luna(__name__, template_folder='dist')
socket_io = socketio.Server(logger=True, async_mode='threading')
app.wsgi_app = socketio.Middleware(socket_io, app.wsgi_app)
