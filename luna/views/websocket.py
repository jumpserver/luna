# ~*~ coding: utf-8 ~*~
import re
import select
import threading
import socket
import collections
import json
import logging

import paramiko
import time
from flask import request, g

from jms.utils import TtyIOParser
from .. import app, socket_io
from ..nav import nav
from ..tasks import command_queue, record_queue

clients = app.clients
logger = logging.getLogger(__file__)


__all__ = [
    'handle_api', 'handle_term_connect', 'handle_machine',
    'handle_data', 'handle_term_disconnect', 'handle_term_resize'
]


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
    t = threading.Thread(target=forward, args=(sid,))
    t.daemon = True
    t.start()
    socket_io.emit('data', 'Connect to %s:%s \r\n' % (host, port), room=sid)


@socket_io.on('data')
def handle_data(sid, message):
    logger.debug('Receive data: %s' % message)
    if clients[sid]['chan']:
        clients[sid]['chan'].send(message)


@socket_io.on('disconnect')
def handle_term_disconnect(sid):
    del clients[sid]
    print('term disconnect')


@socket_io.on('resize')
def handle_term_resize(sid, json):
    logger.debug('Resize term: %s' % json)




def forward(sid):
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
