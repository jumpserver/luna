#!/usr/bin/env python3

import sys
import threading
sys.path.append('/Users/guang/projects/coco')
from flask import Flask, send_from_directory, render_template, request, jsonify, \
    redirect, send_file, abort
from flask_socketio import SocketIO, Namespace, emit, join_room, leave_room
import paramiko
import uuid
from threading import Lock
from flask import Flask, request, current_app, redirect
import eventlet
import time
import json
import socket
import logging
import select
from coco.models import WSProxy, Client, Request
from coco.httpd import ProxyNamespace

logger = logging.getLogger(__file__)
logger.setLevel(logging.DEBUG)
sh = logging.StreamHandler(stream=None)
logger.addHandler(sh)

logger2 = logging.getLogger('coco')
logger2.setLevel(logging.DEBUG)
logger2.addHandler(sh)

eventlet.monkey_patch()
# async_mode = 'threading'
async_mode = 'eventlet'

app = Flask(__name__, template_folder='dist')

socketio = None

nodes = '[{"id":"03059e2e-06b8-4ef1-b949-72e230b706fa","key":"0:9:5","name":"部门1","value":"部门1","parent":"ea4688ef-2b65-40cd-944d-5fca39e34f42","assets_granted":[{"id":"ad594b10-9f64-4913-b7b1-135fe63561d1","hostname":"ali-windows","ip":"47.104.243.139","port":3389,"system_users_granted":[{"id":"8763b81a-bb5e-484a-abca-10514c7bb185","name":"组织1-部门1-Administrator","username":"administrator","priority":10,"protocol":"rdp","comment":""}],"is_active":true,"system_users_join":"administrator","os":null,"domain":null,"platform":"Windows","comment":""},{"id":"d9020939-1dd7-4b18-9165-5124f20d1f77","hostname":"newwindows","ip":"10.1.10.114","port":3389,"system_users_granted":[{"id":"46b57293-c662-46f9-8bc4-dcf64f01bedc","name":"newwindows","username":"administrator","priority":10,"protocol":"rdp","comment":""},{"id":"8763b81a-bb5e-484a-abca-10514c7bb185","name":"组织1-部门1-Administrator","username":"administrator","priority":10,"protocol":"rdp","comment":""}],"is_active":true,"system_users_join":"administrator, administrator","os":null,"domain":null,"platform":"Windows","comment":""},{"id":"9ef36bb3-1bed-455f-be09-3770d3f4bf97","hostname":"test-vm1","ip":"172.19.185.6","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":""}],"is_active":true,"system_users_join":"root","os":null,"domain":null,"platform":"Linux","comment":""},{"id":"1600ed6d-e3b6-434c-a960-c5bb818806b6","hostname":"windows1","ip":"10.1.10.178","port":3389,"system_users_granted":[{"id":"413ea1d2-ef73-4a90-bae3-571ac1b39d93","name":"2012-test-no-passwd-rdp","username":"administrator","priority":10,"protocol":"rdp","comment":""},{"id":"46b57293-c662-46f9-8bc4-dcf64f01bedc","name":"newwindows","username":"administrator","priority":10,"protocol":"rdp","comment":""},{"id":"8763b81a-bb5e-484a-abca-10514c7bb185","name":"组织1-部门1-Administrator","username":"administrator","priority":10,"protocol":"rdp","comment":""}],"is_active":true,"system_users_join":"administrator, administrator, administrator","os":null,"domain":null,"platform":"Windows","comment":""},{"id":"27e50edc-52d9-41ef-8c9e-1bff9d1628b2","hostname":"test-vm2","ip":"172.19.185.7","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":""}],"is_active":true,"system_users_join":"root","os":null,"domain":null,"platform":"Linux","comment":""},{"id":"b6f16269-d02a-4055-9cd8-460fa10b1540","hostname":"test-vm3","ip":"172.19.185.8","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":""}],"is_active":true,"system_users_join":"root","os":null,"domain":null,"platform":"Linux","comment":""},{"id":"b952a481-a624-467e-b97f-9435155f0d53","hostname":"testserver","ip":"10.1.10.192","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":""}],"is_active":true,"system_users_join":"root","os":"CentOS","domain":"8789580f-b5ca-4478-b6d3-d0dafc4c48e8","platform":"Linux","comment":""},{"id":"969247e0-3796-4090-9aa6-3248560079e6","hostname":"test01","ip":"123.123.123.1","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":""}],"is_active":true,"system_users_join":"root","os":null,"domain":null,"platform":"Linux","comment":""},{"id":"7e8451cb-8eb7-4c9d-b652-961a6fdce3c4","hostname":"wz-test","ip":"54.222.180.235","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":""}],"is_active":true,"system_users_join":"root","os":"RedHat","domain":null,"platform":"Linux","comment":""}],"assets_amount":9}]'


class Forwarder:
    def __init__(self, client):
        self.client = client
        width = client.request.meta['width']
        height = client.request.meta['height']
        self.server = self.ssh_with_password(width, height)
        self.watch_win_size_change_async()

    def proxy(self, asset, system_user):
        while True:
            r, w, x = select.select([self.server, self.client], [], [])
            if self.server in r:
                data = self.server.recv(1024)
                if len(data) == 0:
                    break
                self.client.send(data)
            if self.client in r:
                data = self.client.recv(1024)
                if len(data) == 0:
                    break
                self.server.send(data)

    def watch_win_size_change_async(self):
        thread = threading.Thread(target=self.watch_win_size_change)
        thread.daemon = True
        thread.start()

    def ssh_with_password(self, width=80, height=24):
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect("192.168.244.128", 22, "web", "redhat")
        chan = ssh.invoke_shell(term='xterm', width=width, height=height)
        return chan

    def watch_win_size_change(self):
        while self.client.request.change_size_event.wait():
            self.client.request.change_size_event.clear()
            width = self.client.request.meta.get('width', 80)
            height = self.client.request.meta.get('height', 24)
            logger.debug("Change win size: %s - %s" % (width, height))
            try:
                self.server.resize_pty(width=width, height=height)
                # self.server.chan.resize_pty(width=width, height=height)
            except Exception:
                break


class SSHws(ProxyNamespace):

    def on_connect(self):
        logger.debug("ON connect")
        self.new_connection()

    def on_host(self, message):
        # 此处获取主机的信息
        logger.debug("On host event trigger")
        asset_id = message.get('uuid', None)
        user_id = message.get('userid', None)
        secret = message.get('secret', None)
        win_size = message.get('size', (80, 24))

        req = self.make_coco_request(win_size[0], win_size[1])
        room = self.new_room(req)

        self.emit('room', {'room': room["id"], 'secret': secret})
        join_room(room["id"])
        if not asset_id or not user_id:
            return

        # asset = app_service.get_asset(asset_id)
        # system_user = app_service.get_system_user(user_id)

        # if not asset or not system_user:
        #     self.on_connect()
        #     return
        child, parent = socket.socketpair()
        client = Client(parent, room["request"])
        forwarder = Forwarder(client)
        room["client"] = client
        room["forwarder"] = forwarder
        room["proxy"] = WSProxy(self, child, room["id"])
        room["cols"], room["rows"] = win_size
        self.socketio.start_background_task(
            forwarder.proxy, None, None
        )

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
    node = json.loads(nodes)
    return jsonify(node)


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
