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

nodes = [{"id":"03059e2e-06b8-4ef1-b949-72e230b706fa","key":"0:9:5","name":"部门1","value":"部门1","parent":"ea4688ef-2b65-40cd-944d-5fca39e34f42","assets_granted":[{"id":"ad594b10-9f64-4913-b7b1-135fe63561d1","hostname":"ali-windows","ip":"47.104.243.139","port":3389,"system_users_granted":[{"id":"8763b81a-bb5e-484a-abca-10514c7bb185","name":"组织1-部门1-Administrator","username":"administrator","priority":10,"protocol":"rdp","comment":"windows 服务器而已"}],"is_active":True,"system_users_join":"administrator","os":None,"domain":None,"platform":"Windows","comment":"只是个windows而已"},{"id":"d9020939-1dd7-4b18-9165-5124f20d1f77","hostname":"newwindows","ip":"10.1.10.114","port":3389,"system_users_granted":[{"id":"46b57293-c662-46f9-8bc4-dcf64f01bedc","name":"newwindows","username":"administrator","priority":10,"protocol":"rdp","comment":"只是个windows而已"},{"id":"8763b81a-bb5e-484a-abca-10514c7bb185","name":"组织1-部门1-Administrator","username":"administrator","priority":10,"protocol":"rdp","comment":"只是个windows而已"}],"is_active":True,"system_users_join":"administrator, administrator","os":None,"domain":None,"platform":"Windows","comment":"只是个windows而已"},{"id":"9ef36bb3-1bed-455f-be09-3770d3f4bf97","hostname":"test-vm1","ip":"172.19.185.6","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":"只是个windows而已"}],"is_active":True,"system_users_join":"root","os":None,"domain":None,"platform":"Linux","comment":"只是个windows而已"},{"id":"1600ed6d-e3b6-434c-a960-c5bb818806b6","hostname":"windows1","ip":"10.1.10.178","port":3389,"system_users_granted":[{"id":"413ea1d2-ef73-4a90-bae3-571ac1b39d93","name":"2012-test-no-passwd-rdp","username":"administrator","priority":10,"protocol":"rdp","comment":"只是个windows而已"},{"id":"46b57293-c662-46f9-8bc4-dcf64f01bedc","name":"newwindows","username":"administrator","priority":10,"protocol":"rdp","comment":"只是个windows而已"},{"id":"8763b81a-bb5e-484a-abca-10514c7bb185","name":"组织1-部门1-Administrator","username":"administrator","priority":10,"protocol":"rdp","comment":"只是个windows而已"}],"is_active":True,"system_users_join":"administrator, administrator, administrator","os":None,"domain":None,"platform":"Windows","comment":"只是个windows而已"},{"id":"27e50edc-52d9-41ef-8c9e-1bff9d1628b2","hostname":"test-vm2","ip":"172.19.185.7","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":"只是个windows而已"}],"is_active":True,"system_users_join":"root","os":None,"domain":None,"platform":"Linux","comment":"只是个windows而已"},{"id":"b6f16269-d02a-4055-9cd8-460fa10b1540","hostname":"test-vm3","ip":"172.19.185.8","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":"只是个windows而已"}],"is_active":True,"system_users_join":"root","os":None,"domain":None,"platform":"Linux","comment":"只是个windows而已"},{"id":"b952a481-a624-467e-b97f-9435155f0d53","hostname":"testserver","ip":"10.1.10.192","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":"只是个windows而已"}],"is_active":True,"system_users_join":"root","os":"CentOS","domain":"8789580f-b5ca-4478-b6d3-d0dafc4c48e8","platform":"Linux","comment":"只是个windows而已"},{"id":"969247e0-3796-4090-9aa6-3248560079e6","hostname":"test01","ip":"123.123.123.1","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":"只是个windows而已"}],"is_active":True,"system_users_join":"root","os":None,"domain":None,"platform":"Linux","comment":"只是个windows而已"},{"id":"7e8451cb-8eb7-4c9d-b652-961a6fdce3c4","hostname":"wz-test","ip":"54.222.180.235","port":22,"system_users_granted":[{"id":"7e326f71-aee5-4688-8cc1-717919470a09","name":"root","username":"root","priority":10,"protocol":"ssh","comment":"只是个windows而已"}],"is_active":True,"system_users_join":"root","os":"RedHat","domain":None,"platform":"Linux","comment":"只是个windows而已"}],"assets_amount":9}]


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
    data1 = [
      {
        "id": "3e1930e1-759d-430e-8935-fbd563463373",
        "key": "0:3",
        "value": "Node 2",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:3",
        "tree_parent": "0",
        "assets_amount": 9
      },
      {
        "id": "508e8674-0c51-471c-98b5-13f0612c6aba",
        "key": "0",
        "value": "ROOT",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0",
        "tree_parent": "",
        "assets_amount": 9
      },
      {
        "id": "52b8aa5e-5e5e-4721-a749-2f4f4655ae35",
        "key": "0:0",
        "value": "新节点 1",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:0",
        "tree_parent": "0",
        "assets_amount": 9
      },
      {
        "id": "5904ae0e-bf06-447d-a963-c89369295d5a",
        "key": "0:4",
        "value": "Node 4",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:4",
        "tree_parent": "0",
        "assets_amount": 9
      },
      {
        "id": "60daaa36-92ac-4d0f-b59e-f7f153ecc302",
        "key": "0:1",
        "value": "新节点 2",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:1",
        "tree_parent": "0",
        "assets_amount": 9
      },
      {
        "id": "8e8999f3-9093-4218-af12-cc126a15cb94",
        "key": "0:5",
        "value": "Node 5",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:5",
        "tree_parent": "0",
        "assets_amount": 9
      },
      {
        "id": "a5a2d42e-7b6d-4e45-905a-74a0bd8c2266",
        "key": "0:7",
        "value": "Node 37",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:7",
        "tree_parent": "0",
        "assets_amount": 9
      },
      {
        "id": "b8dd922e-fac0-4f15-b70a-01263203002d",
        "key": "0:2",
        "value": "Node 0",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:2",
        "tree_parent": "0",
        "assets_amount": 9
      },
      {
        "id": "e16c04d3-84a5-4b6d-8f10-ccb195729035",
        "key": "0:6",
        "value": "Node 15",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:6",
        "tree_parent": "0",
        "assets_amount": 9
      },
      {
        "id": "051142d0-9090-44f7-aa9d-d8a563cc04d4",
        "key": "0:0",
        "value": "lillian64",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:0",
        "tree_parent": "0",
        "assets_amount": 0
      },
      {
        "id": "12a542c1-f787-485e-ac46-de6421c93d2d",
        "key": "0:0",
        "value": "sandra76",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:0",
        "tree_parent": "0",
        "assets_amount": 0
      },
      {
        "id": "2cba1640-6e7e-470a-9da7-2f736b4d0aa5",
        "key": "0:0",
        "value": "wanda88",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:0",
        "tree_parent": "0",
        "assets_amount": 0
      },
      {
        "id": "58839e9c-5649-4e00-8e77-073b800091ff",
        "key": "0:0",
        "value": "mildred87",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:0",
        "tree_parent": "0",
        "assets_amount": 0
      },
      {
        "id": "64ce5de9-18df-40a8-b663-8c6515e37e42",
        "key": "0:0",
        "value": "jessica82",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:0",
        "tree_parent": "0",
        "assets_amount": 0
      },
      {
        "id": "72e26e8c-2146-49ad-8803-1c95e47d4447",
        "key": "0:0",
        "value": "paula79",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:0",
        "tree_parent": "0",
        "assets_amount": 0
      },
      {
        "id": "aa7bb5e1-57ba-4c68-933c-aa2bc9204880",
        "key": "0:0",
        "value": "patricia77",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:0",
        "tree_parent": "0",
        "assets_amount": 0
      },
      {
        "id": "ced63974-9ade-4081-b0ba-2befc55ea380",
        "key": "0:0",
        "value": "irene94",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:0",
        "tree_parent": "0",
        "assets_amount": 0
      },
      {
        "id": "db152e40-8a49-4206-bea8-d05cf0cda50d",
        "key": "0:0",
        "value": "karen77",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:0",
        "tree_parent": "0",
        "assets_amount": 0
      }
    ]
    data2 = [
      {
        "id": "02db2050-882f-4f42-8af5-cbb2b3262f88",
        "key": "0:3:3",
        "value": "Node 42",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:3:3",
        "tree_parent": "0:3",
        "assets_amount": 27
      },
      {
        "id": "3e1930e1-759d-430e-8935-fbd563463373",
        "key": "0:3",
        "value": "Node 2",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:3",
        "tree_parent": "0",
        "assets_amount": 27
      },
      {
        "id": "77963655-c559-4cad-8534-a1f7e20efb61",
        "key": "0:3:1",
        "value": "Node 18",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:3:1",
        "tree_parent": "0:3",
        "assets_amount": 27
      },
      {
        "id": "950453cd-3e1d-4d89-addc-3fa77e34e7a9",
        "key": "0:3:2",
        "value": "Node 28",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:3:2",
        "tree_parent": "0:3",
        "assets_amount": 27
      },
      {
        "id": "e24377ec-f63e-4dd0-970b-c047ad40b3f2",
        "key": "0:3:0",
        "value": "Node 8",
        "system_users_granted": [],
        "is_node": True,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 27
      },
      {
        "id": "00671d2e-0e45-43b8-8765-8a677676aed0",
        "key": "0:3:0",
        "value": "robin65",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "1495d4f8-882c-48c1-a9f4-2369f0f0ea09",
        "key": "0:3:0",
        "value": "phyllis94",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "1a2f4ff7-76c6-4ff2-b1dc-c81b5979ff1b",
        "key": "0:3:0",
        "value": "pamela84",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "1d302510-4860-437b-a3cc-f7b6a883fb87",
        "key": "0:3:0",
        "value": "janet89",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "40f059b2-1acf-4f16-ab7c-32403d38260a",
        "key": "0:3:0",
        "value": "susan63",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "52f7aba9-56a0-4af2-ad77-bf4807092123",
        "key": "0:3:0",
        "value": "brenda64",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "53f16504-8add-4bef-8125-f87abf52d3cc",
        "key": "0:3:0",
        "value": "marilyn74",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "7c17089b-67d1-43c8-8f5e-d213bde59ef1",
        "key": "0:3:0",
        "value": "betty90",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "80478c9a-0e7f-4d50-b94c-c7f0fd40f5b2",
        "key": "0:3:0",
        "value": "lisa94",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "82e8d997-923a-4fc2-8358-0c02626ecc8f",
        "key": "0:3:0",
        "value": "carolyn87",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "8943134f-9f3d-4731-89ad-61bd1d0b068b",
        "key": "0:3:0",
        "value": "ann66",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "8d7dadcf-5f09-4c7d-971b-e65413378ee1",
        "key": "0:3:0",
        "value": "norma78",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "8da3e293-a487-4018-87b7-3bef2405fd03",
        "key": "0:3:0",
        "value": "susan80",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "93326d6c-06e1-4630-8c36-3505492cfefb",
        "key": "0:3:0",
        "value": "janet93",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "93a0ece4-b582-425b-9103-0156eaf49f22",
        "key": "0:3:0",
        "value": "louise77",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "9cb0af28-ca60-4e4e-983f-bd5069579264",
        "key": "0:3:0",
        "value": "wanda79",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "b45f40b9-0607-42a0-9643-0e8f71a6b33d",
        "key": "0:3:0",
        "value": "kathryn73",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "c0ccd5d2-d6cb-49e1-ad27-6368289f407e",
        "key": "0:3:0",
        "value": "mildred89",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "d042c10a-a117-4ef1-96ad-e97b84c59517",
        "key": "0:3:0",
        "value": "patricia92",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "d0901a25-d233-4466-8f92-e6cbb069a765",
        "key": "0:3:0",
        "value": "joyce90",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "d621bca0-a6e8-4c95-bf93-e822faf42b0a",
        "key": "0:3:0",
        "value": "julia74",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "db17f755-e977-4d71-ab79-96e359b6fc76",
        "key": "0:3:0",
        "value": "betty78",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "db20e2d8-7f97-4d91-8c87-5a51772bcea8",
        "key": "0:3:0",
        "value": "kathryn74",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "df112a11-b1b6-41f9-bb58-d3a14ec2cfad",
        "key": "0:3:0",
        "value": "lois88",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "e1ab8523-1b35-4d07-8acd-082ca33f03b9",
        "key": "0:3:0",
        "value": "jennifer93",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "f3bef5a9-fb9d-4ead-be0b-a1d5f300d6a7",
        "key": "0:3:0",
        "value": "jacqueline83",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      },
      {
        "id": "f5488aac-a474-42c3-b321-a872f2d1826d",
        "key": "0:3:0",
        "value": "cheryl92",
        "system_users_granted": [
          {
            "id": "f78cfcb2-d473-43b6-a72a-8cc18979aabd",
            "name": "web",
            "username": "web"
          }
        ],
        "is_node": False,
        "org_id": "",
        "tree_id": "0:3:0",
        "tree_parent": "0:3",
        "assets_amount": 0
      }
    ]
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
