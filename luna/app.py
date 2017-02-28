# ~*~ coding: utf-8 ~*~

import logging
import time
import threading

from flask import Flask
from flask_socketio import SocketIO
from .conf import config
from .service import service


logger = logging.getLogger(__file__)


__version__ = '0.4.0'


class Luna(Flask):
    service = service
    proxy_list = {}
    clients = {}
    active = True

    def bootstrap(self):
        print(time.ctime())
        print(
            'Luna version %s, more see https://www.jumpserver.org' % __version__)
        print('Starting ssh server at %(host)s:%(port)s' %
              {'host': self.config['BIND_HOST'],
               'port': self.config['LISTEN_PORT']})
        print('Quit the server with CONTROL-C.')
        self.heatbeat()

    def handle_task(self, tasks):
        for task in tasks:
            if task['name'] == 'kill_proxy':
                try:
                    proxy_log_id = int(task['proxy_log_id'])
                except ValueError:
                    pass
                if proxy_log_id in self.proxy_list:
                    client_channel, backend_channel = self.proxy_list.get(
                        proxy_log_id)
                    client_channel.send('Terminated by admin  ')
                    backend_channel.close()
                    client_channel.close()

    def heatbeat(self):
        def _keep():
            while True:
                result = service.terminal_heatbeat()
                if result is None:
                    logger.warning('Terminal heatbeat failed or '
                                   'Terminal need accepted by administrator')
                else:
                    tasks = result.get('tasks')
                    if tasks:
                        logger.info('Receive task: %s' % tasks)
                        print(tasks)
                        self.handle_task(tasks)
                time.sleep(config.HEATBEAT_INTERVAL)

        thread = threading.Thread(target=_keep)
        thread.daemon = True
        thread.start()

    def stop(self):
        self.active = False
        for i in Luna.clients:
            i.disconnect()
        socket_io.stop()

async_mode = 'gevent'
app = Luna(__name__, template_folder='dist')
socket_io = SocketIO(app, async_mode=async_mode)
app.config.update(**config)
