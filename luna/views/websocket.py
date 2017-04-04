# ~*~ coding: utf-8 ~*~
import threading
import collections
import time
import json
from flask import request, g
from flask_socketio import send, emit, disconnect

from jms.utils import to_dotmap
from .. import app, socket_io
from ..proxy import ProxyServer
from ..channel import ProxyChannel
from ..authentication import login_required

clients = app.clients
logger = app.logger


__all__ = [
    'handle_term_connect', 'handle_machine',
    'handle_data', 'handle_term_disconnect', 'handle_term_resize',
]


@socket_io.on('connect', namespace='/')
def handle_term_connect():
    clients[request.sid] = collections.defaultdict(dict)


def get_asset_system_user(asset_id, system_user_id):
    asset = g.assets.get(asset_id)
    system_users = asset['system_users']
    system_user = None
    for s in system_users:
        if s['id'] == system_user_id:
            system_user = s
    if not asset or not system_user:
        return None, None
    asset = to_dotmap(asset)
    system_user = to_dotmap(system_user)
    password, private_key = app.service.get_system_user_auth_info(system_user)
    system_user['password'] = password
    system_user['private_key'] = private_key
    return asset, system_user


@socket_io.on('machine')
@login_required
def handle_machine(message):
    sid = request.sid
    print('Get message: {}'.format(message))
    asset_id = message.get('assetId')
    system_user_id = message.get('sysUserId')
    if not asset_id or not system_user_id:
        msg = 'No asset id or system user id'
        emit('data', message)
        disconnect()
        logger.warning(msg)
        return

    asset, system_user = get_asset_system_user(asset_id, system_user_id)
    if None in (asset, system_user):
        disconnect()
    user = to_dotmap(g.user)
    clients[sid]['host'] = asset['ip']
    clients[sid]['port'] = asset['port']
    win_width = request.cookies.get('cols')
    win_height = request.cookies.get('rows')
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
    if clients[sid]['proxy_chan']:
        clients[sid]['proxy_chan'].write(message)


@socket_io.on('disconnect')
def handle_term_disconnect():
    sid = request.sid
    del clients[sid]
    disconnect()
    print('term disconnect')


@socket_io.on('resize')
def handle_term_resize(json):
    sid = request.sid
    logger.debug('Resize term: %s' % json)


# Todo: flask app logger using
