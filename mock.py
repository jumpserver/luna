#!/usr/bin/env python3
# coding: utf-8


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

nodes = [{'id': '6353b2d3-54f1-4354-bede-fe8d8eebfe0c',
  'key': '4',
  'name': '开发部',
  'value': '开发部',
  'parent': '6353b2d3-54f1-4354-bede-fe8d8eebfe0c',
  'assets_granted': [{'id': '9e911ac3-7231-441b-9123-e1945e93c0b0',
    'hostname': 'Test-48',
    'ip': '172.15.1.48',
    'port': 22,
    'system_users_granted': [{'id': '859274bb-dc6e-4890-87dc-eefddf0ea8c1',
      'name': '111',
      'username': '1',
      'priority': 20,
      'protocol': 'ssh',
      'comment': '',
      'login_mode': 'auto'}],
    'is_active': True,
    'system_users_join': '1',
    'os': None,
    'domain': None,
    'platform': 'Linux',
    'comment': '',
    'protocol': 'ssh',
    'org_id': 'e338bd97-bdb1-47b1-95f7-4994776488b5',
    'org_name': '开发部'}],
  'assets_amount': 1,
  'org_id': 'e338bd97-bdb1-47b1-95f7-4994776488b5'},
 {'id': 'cd3c1d48-4bf0-43e1-bca1-0817a1295e22',
  'key': '5:23:0:1',
  'name': '新节点 2',
  'value': '新节点 2',
  'parent': 'a3852030-eeb5-4c0f-ba57-32cce42c8333',
  'assets_granted': [{'id': '9590ebfa-5720-461d-835f-fecfe6245c67',
    'hostname': 'Test-48',
    'ip': '172.15.1.48',
    'port': 22,
    'system_users_granted': [{'id': 'e2b1900f-b0e6-4813-b90a-7216d670a1cd',
      'name': 'test_SSH',
      'username': 'test',
      'priority': 10,
      'protocol': 'ssh',
      'comment': '',
      'login_mode': 'auto'}],
    'is_active': True,
    'system_users_join': 'test',
    'os': None,
    'domain': None,
    'platform': 'Linux',
    'comment': '',
    'protocol': 'ssh',
    'org_id': '8eb2637c-e14f-41f1-b1b1-00a2dfa20248',
    'org_name': '测试部'}],
  'assets_amount': 1,
  'org_id': '8eb2637c-e14f-41f1-b1b1-00a2dfa20248'},
 {'id': 'a3852030-eeb5-4c0f-ba57-32cce42c8333',
  'key': '5:23:0',
  'name': '新节点 1',
  'value': '新节点 1',
  'parent': '39c0f461-e9c2-4ef5-926d-3308ae9c43d8',
  'assets_granted': [],
  'assets_amount': 0,
  'org_id': '8eb2637c-e14f-41f1-b1b1-00a2dfa20248'},
 {'id': '39c0f461-e9c2-4ef5-926d-3308ae9c43d8',
  'key': '5:23',
  'name': 'hbase',
  'value': 'hbase',
  'parent': 'd49f0fb2-ad3e-4f13-835f-12c13329f3be',
  'assets_granted': [],
  'assets_amount': 0,
  'org_id': '8eb2637c-e14f-41f1-b1b1-00a2dfa20248'},
 {'id': 'd49f0fb2-ad3e-4f13-835f-12c13329f3be',
  'key': '5',
  'name': '测试部',
  'value': '测试部',
  'parent': 'd49f0fb2-ad3e-4f13-835f-12c13329f3be',
  'assets_granted': [],
  'assets_amount': 0,
  'org_id': '8eb2637c-e14f-41f1-b1b1-00a2dfa20248'},
 {'id': 'c10cb68a-816d-4030-9a7b-e9a22a83818a',
  'key': '5:12',
  'name': '测试资产666',
  'value': '测试资产666',
  'parent': 'd49f0fb2-ad3e-4f13-835f-12c13329f3be',
  'assets_granted': [{'id': '9590ebfa-5720-461d-835f-fecfe6245c67',
    'hostname': 'Test-48',
    'ip': '172.15.1.48',
    'port': 22,
    'system_users_granted': [{'id': 'e2b1900f-b0e6-4813-b90a-7216d670a1cd',
      'name': 'test_SSH',
      'username': 'test',
      'priority': 10,
      'protocol': 'ssh',
      'comment': '',
      'login_mode': 'auto'}],
    'is_active': True,
    'system_users_join': 'test',
    'os': None,
    'domain': None,
    'platform': 'Linux',
    'comment': '',
    'protocol': 'ssh',
    'org_id': '8eb2637c-e14f-41f1-b1b1-00a2dfa20248',
    'org_name': '测试部'}],
  'assets_amount': 1,
  'org_id': '8eb2637c-e14f-41f1-b1b1-00a2dfa20248'},
 {'id': 'c57099a1-f1fc-48d2-9d0c-611ed65560b2',
  'key': '5:3',
  'name': '测试资产265465',
  'value': '测试资产265465',
  'parent': 'd49f0fb2-ad3e-4f13-835f-12c13329f3be',
  'assets_granted': [{'id': '965e86b1-b09a-4c1e-8b6c-784803fdeeaf',
    'hostname': 'Test01-22',
    'ip': '172.15.2.22',
    'port': 22,
    'system_users_granted': [{'id': 'e2b1900f-b0e6-4813-b90a-7216d670a1cd',
      'name': 'test_SSH',
      'username': 'test',
      'priority': 10,
      'protocol': 'ssh',
      'comment': '',
      'login_mode': 'auto'}],
    'is_active': True,
    'system_users_join': 'test',
    'os': None,
    'domain': None,
    'platform': 'Linux',
    'comment': '',
    'protocol': 'ssh',
    'org_id': '8eb2637c-e14f-41f1-b1b1-00a2dfa20248',
    'org_name': '测试部'}],
  'assets_amount': 1,
  'org_id': '8eb2637c-e14f-41f1-b1b1-00a2dfa20248'}]

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
                self.resize_win_size()

    def resize_win_size(self):
        width, height = self.client.request.meta['width'], \
                        self.client.request.meta['height']
        logger.debug("Resize server chan size {}*{}".format(width, height))
        self.server.resize_pty(width=width, height=height)

    def ssh_with_password(self, width=80, height=24):
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect("192.168.244.177", 22, "root", "redhat123")
        chan = ssh.invoke_shell(term='xterm', width=width, height=height)
        return chan


class SSHws(ProxyNamespace):

    def connect_host(self, message):
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


@app.route('/api/perms/v1/user/nodes-assets/')
def asset_groups_assets():
    # node = json.loads(nodes)
    return jsonify([])


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


@app.route('/api/perms/v1/user/nodes/children/')
def get_nodes_children():
    data1 = nodes
    if request.args.get('id'):
        return jsonify(data2)
    else:
        return jsonify(data1)


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
