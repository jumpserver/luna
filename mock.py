#!/usr/bin/env python3


import eventlet
eventlet.monkey_patch()

import sys
sys.path.append('/Users/guang/projects/coco')
from flask import Flask, send_from_directory, render_template, request, jsonify, \
    redirect, send_file, abort
from flask_socketio import SocketIO, Namespace, emit, join_room, leave_room
import paramiko
import uuid
from flask import Flask, request, current_app, redirect
import time
import json
import socket
import logging
import select
from coco.models import WSProxy, Client, Request, Connection
from coco.httpd.ws import ProxyNamespace

logger = logging.getLogger(__file__)
logger.setLevel(logging.DEBUG)
sh = logging.StreamHandler(stream=None)
logger.addHandler(sh)

logger2 = logging.getLogger('coco')
logger2.setLevel(logging.DEBUG)
fmt = "%(asctime)s [%(module)s %(levelname)s] %(message)s"
dtfmt = "%Y-%m-%d %H:%M:%S"
fmter = logging.Formatter(fmt=fmt, datefmt=dtfmt)
sh.setFormatter(fmter)
logger2.addHandler(sh)

# async_mode = 'threading'
async_mode = 'eventlet'

app = Flask(__name__, template_folder='dist')

socketio = None

nodes = [{'iconSkin': '',
  'id': '0',
  'isParent': True,
  'meta': {'node': {'id': '08a2ba4c-238a-4e01-9f07-eb82b8e3377b',
    'key': '0',
    'name': 'ROOT',
    'value': 'ROOT'},
   'type': 'node'},
  'name': 'ROOT (2)',
  'open': True,
  'pId': '',
  'title': 'ROOT (2)'},
 {'iconSkin': 'linux',
  'id': 'f4d3b256-c19b-4472-9a53-b9f48e51f311',
  'isParent': False,
  'meta': {'asset': {'comment': '',
    'domain': None,
    'hostname': 'centos',
    'id': 'f4d3b256-c19b-4472-9a53-b9f48e51f311',
    'ip': '192.168.244.142',
    'is_active': True,
    'platform': 'Linux',
    'port': 22,
    'protocol': 'ssh'},
   'system_users': [{'comment': '',
     'id': '2fb10ed2-db03-4c69-9fc1-aacbb2a9cc75',
     'login_mode': 'auto',
     'name': 'web',
     'priority': 20,
     'protocol': 'ssh',
     'username': 'web'}],
   'type': 'asset'},
  'name': 'centos',
  'open': False,
  'pId': '0',
  'title': '192.168.244.142'},
 {'iconSkin': 'windows',
  'id': '741127ed-1e51-46c0-8d3d-f8a7d215b70d',
  'isParent': False,
  'meta': {'asset': {'comment': '',
    'domain': None,
    'hostname': 'windows',
    'id': '741127ed-1e51-46c0-8d3d-f8a7d215b70d',
    'ip': '192.168.244.142',
    'is_active': True,
    'platform': 'Windows',
    'port': 3389,
    'protocol': 'rdp'},
   'system_users': [],
   'type': 'asset'},
  'name': 'windows',
  'open': False,
  'pId': '0',
  'title': '192.168.244.142'}]


class ProxyServer:
    def __init__(self, client, asset, system_user):
        self.client = client
        width = client.request.meta['width']
        height = client.request.meta['height']
        self.server = self.ssh_with_password(width, height)

    def proxy(self):
        while True:
            r, w, x = select.select([self.server, self.client, self.client.change_size_evt], [], [])
            if self.server in r:
                data = self.server.recv(1024)
                if len(data) == 0:
                    break
                self.client.send(data)
            elif self.client in r:
                data = self.client.recv(1024)
                if len(data) == 0:
                    break
                self.server.send(data)
            elif self.client.change_size_evt in r:
                self.client.change_size_evt.recv(1)
                self.resize_win_size()

    def resize_win_size(self):
        width, height = self.client.request.meta['width'], \
                        self.client.request.meta['height']
        logger.debug("Resize server chan size {}*{}".format(width, height))
        self.server.resize_pty(width=width, height=height)

    def ssh_with_password(self, width=80, height=24):
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect("192.168.244.185", 22, "root", "redhat")
        chan = ssh.invoke_shell(term='xterm', width=width, height=height)
        return chan


class SSHws(ProxyNamespace):

    def connect_host(self, message):
        print("Connect host: {}".format(message))
        asset_id = message.get('uuid', None)
        system_user_id = message.get('userid', None)
        secret = message.get('secret', None)
        cols, rows = message.get('size', (80, 24))
        request.current_user = "admin"

        connection = Connection.get_connection(request.sid)
        client_id = str(uuid.uuid4())
        client = connection.new_client(client_id)
        client.request.kind = 'session'
        client.request.type = 'pty'
        client.request.meta.update({
            'pty': b'xterm', 'width': cols, 'height': rows,
        })
        ws_proxy = WSProxy(self, client_id)
        client.chan = ws_proxy
        self.emit('room', {'room': client_id, 'secret': secret})
        join_room(client_id)
        if not asset_id or not system_user_id:
            return

        forwarder = ProxyServer(client, None, None)

        def proxy():
            forwarder.proxy()
            self.emit('data', {'data': 'Disconnected', 'room': client_id}, room=client_id)
            self.logout(client_id, connection)
        self.socketio.start_background_task(proxy)

    def on_token(self, message):
        # 此处获取token含有的主机的信息
        logger.debug("On token trigger")
        token = message.get('token', None)
        secret = message.get('secret', None)
        size = message.get('size', (80, 24))
        room = self.new_room()
        self.emit('room', {'room': room["id"], 'secret': secret})
        if not token or not secret:
            logger.debug("Token or secret is None: {}".format(token, secret))
            self.emit('data', {'data': "\nOperation not permitted!",
                               'room': room["id"]})
            self.emit('disconnect')
            return None

        logger.debug(self.current_user)
        self.on_host({
            'secret': secret,
            'uuid': 'asset',
            'userid': 'system_user',
            'size': size
        })


@app.route('/luna/<path:path>')
def send_js(path):
    return send_from_directory('dist', path)


@app.route('/api/perms/v1/user/nodes-assets/tree/')
def asset_groups_assets():
    return jsonify(nodes)


@app.route('/api/terminal/v1/sessions/test/replay/')
def replay():
    return redirect(
        "http://jps.ilz.me/media/2017-12-24/ec87a486-0344-4f12-b27a-620321944f7f.gz")


@app.route('/api/terminal/v2/sessions/<pk>/replay/')
def get_session_replay(pk):
    # return jsonify({
    #   'type': 'guacamole',
    #   'src': 'http://localhost/media/2018-05-07/5c205f0a-b5ae-405a-9444-c0d59262ec29.gz',
    #   'status': 'DONE'
    # })
    return jsonify({
        'type': 'json',
        'src': 'http://localhost/media/replay/2018-06-08/581a12ca-fa8f-4399-8800-f97935219ddf.replay.gz',
        'status': 'DONE',
    })


@app.route('/luna/i18n/<i18n>')
def i18n(i18n):
    return send_file('./i18n/' + i18n)


def read_file(filename, charset='utf-8'):
    with open(filename, 'rb') as f:
        return f.read().decode(charset)


if __name__ == '__main__':
    socketio = SocketIO(app, async_mode=async_mode)
    socketio.on_namespace(SSHws('/ssh'))
    socketio.run(app, port=5001)
