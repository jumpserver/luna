# ~*~ coding: utf-8 ~*~
import select
import threading
import collections
import json
import logging

import paramiko
from flask import request, g

from jms.utils import to_dotmap
from .. import app, socket_io
from ..nav import nav
from ..proxy import ProxyServer
from ..channel import ProxyChannel

clients = app.clients
logger = logging.getLogger(__file__)


__all__ = [
    'handle_api', 'handle_term_connect', 'handle_machine',
    'handle_data', 'handle_term_disconnect', 'handle_term_resize'
]


@socket_io.on('nav')
def handle_api():
    socket_io.emit('nav', json.dumps(nav))


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
    logger.debug('Receive data: %s' % message)
    if clients[sid]['proxy_chan']:
        print('Sending to client channel')
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

"""

@socket_io.on('nav')
def handle_api(sid):
    socket_io.emit('nav', json.dumps(nav), room=sid)


@socket_io.on('connect', namespace='/')
def handle_term_connect(sid, environ):
    clients[sid] = collections.defaultdict(dict)


@socket_io.on('machine')
def handle_machine(sid, message):
    clients[sid]['host'] = host = '120.25.240.109'
    clients[sid]['port'] = port = 8022
    user = to_dotmap({'username': 'root', 'name': 'redhat'})
    asset = to_dotmap({'hostname': host, 'ip': host, 'port': 8022})
    # win_width = request.cookies.get('col')
    # win_height = request.cookies.get('row')
    system_user = to_dotmap({'name': 'jms', 'username': 'jms', 'id': 102})
    clients[sid]['proxy_chan'] = proxy_chan = ProxyChannel(sid)
    # proxy_chan.set_win_size((win_width, win_height))
    proxy_server = ProxyServer(app, user, asset, system_user, proxy_chan)
    t = threading.Thread(target=proxy_server.proxy, args=())
    t.daemon = True
    t.start()


@socket_io.on('data')
def handle_data(sid, message):
    logger.debug('Receive data: %s' % message)
    if clients[sid]['proxy_chan']:
        print('Sending to client channel')
        clients[sid]['proxy_chan'].write(message)


@socket_io.on('disconnect')
def handle_term_disconnect(sid):
    del clients[sid]
    print('term disconnect')


@socket_io.on('resize')
def handle_term_resize(sid, json):
    logger.debug('Resize term: %s' % json)
"""

### Only for test ###

def forward(sid):
    print(request)
    try:
        host = clients[sid]['host']
        port = clients[sid]['port']
    except KeyError as e:
        socket_io.emit('data', e, room=sid)
        return
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username='jms', password='redhat')
    clients[sid]['ssh'] = ssh
    clients[sid]['chan'] = chan = ssh.invoke_shell()
    while app.active:
        r, w, x = select.select([chan], [], [])
        if chan in r:
            data = chan.recv(1024)
            if not len(data):
                break
            socket_io.emit('data', data, room=sid)
    del clients[sid]


def handle(p):
    while True:
        r, w, x = select.select([p], [], [])
        if p in r:
            data = p.recv(1024)
            if len(data) == 0:
                break
            print("Recieve client: %s" % data)

