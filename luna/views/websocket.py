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
]


@socket_io.on('nav')
def handle_nav():
    socket_io.emit('nav', json.dumps(nav))


@socket_io.on('connect', namespace='/')
def handle_term_connect():
    clients[request.sid] = collections.defaultdict(dict)


@socket_io.on('machine')
def handle_machine(message):
    print('Get message: {}'.format(message))
    sid = request.sid
    message_json = json.loads(message)
    asset_id = message_json.get('assetId', 0)
    system_user_id = message_json.get('sysUserId', 0)
    socket_io.emit('data', 'Connect assetId: {} sysUserId: {}'.format(asset_id, system_user_id))
    socket_io.disconnect()
    return
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
