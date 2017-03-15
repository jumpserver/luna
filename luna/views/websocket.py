# ~*~ coding: utf-8 ~*~
import threading
import collections
import json
from flask import request, g

from jms.utils import to_dotmap
from .. import app, socket_io
from ..nav import nav
from ..proxy import ProxyServer
from ..channel import ProxyChannel

clients = app.clients
logger = app.logger


__all__ = [
    'handle_nav', 'handle_term_connect', 'handle_machine',
    'handle_data', 'handle_term_disconnect', 'handle_term_resize',
    'handle_assets',
]


@socket_io.on('nav')
def handle_nav():
    socket_io.emit('nav', json.dumps(nav))


@socket_io.on('assets')
def handle_assets():
    groups_assets = {
        'DB': [
            {
                'id': 1,
                'hostname': 'test-db-1',
                'ip': '192.168.1.1',
                'system_users': [
                    {
                        'id': 3,
                        'name': '测试环境web',
                        'username': 'web'
                    },
                    {
                        'id': 6,
                        'name': '测试环境sa',
                        'username': 'sa'
                    },
                ]
            }
        ],
        'JAVA': [
            {
                'id': 3,
                'hostname': 'test1-java',
                'ip': '120.25.240.109',
                'port': 8022,
                'system_users': [
                    {
                        'id': 3,
                        'name': 'web',
                        'username': 'web'
                    }
                ]
            }
        ]
    }
    socket_io.emit('assets', json.dumps(groups_assets))


@socket_io.on('connect', namespace='/')
def handle_term_connect():
    clients[request.sid] = collections.defaultdict(dict)


@socket_io.on('machine')
def handle_machine(message):
    sid = request.sid
    clients[sid]['host'] = host = '120.25.240.109'
    clients[sid]['port'] = port = 8022
    user = to_dotmap({'username': 'root', 'name': 'redhat'})
    asset = to_dotmap({'hostname': host, 'ip': host, 'port': 8022})
    win_width = request.cookies.get('cols')
    win_height = request.cookies.get('rows')
    system_user = to_dotmap({'name': 'jms', 'username': 'jms', 'id': 102})
    clients[sid]['proxy_chan'] = proxy_chan = ProxyChannel(sid)
    proxy_chan.set_win_size((win_width, win_height))
    stop_event = threading.Event()
    clients[sid]['stop_event'] = stop_event
    proxy_server = ProxyServer(app, user, asset, system_user,
                               proxy_chan, stop_event)
    socket_io.start_background_task(proxy_server.proxy)


@socket_io.on('data')
def handle_data(message):
    sid = request.sid
    message = message.encode('utf-8')
    logger.warning('Receive data: %s' % message)
    if clients[sid]['proxy_chan']:
        logger.info('Sending to client channel')
        clients[sid]['proxy_chan'].write(message)


@socket_io.on('disconnect')
def handle_term_disconnect():
    sid = request.sid
    del clients[sid]
    print('term disconnect')


@socket_io.on('resize')
def handle_term_resize(json):
    sid = request.sid
    logger.debug('Resize term: %s' % json)


# Todo: flask app logger using
