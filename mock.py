#!/usr/bin/env python3

from flask import Flask, send_from_directory, render_template, request, jsonify, redirect, send_file, abort
from flask_socketio import SocketIO, Namespace, emit, join_room, leave_room
import paramiko
import uuid
from threading import Lock
from flask import Flask, request, current_app, redirect
import eventlet
import time

eventlet.monkey_patch()
# async_mode = 'threading'
async_mode = 'eventlet'

app = Flask(__name__, template_folder='dist')


socketio = None
thread = None
thread_lock = Lock()


class SSHws(Namespace):
    def __init__(self, *args, **kwargs):
        """
        :param args:
        :param kwargs:

        self.connections = {
            "request_sid": {
                "room_id": {
                    "id": room_id,
                    "proxy": None,
                    "client": None,
                    "forwarder": None,
                    "request": None,
                    "cols": 80,
                    "rows": 24
                },
                ...
            },
            ...
        }
        """
        super().__init__(*args, **kwargs)
        self.connections = dict()

    def ssh_with_password(self, ws, room_id):
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect("192.168.244.176", 22, "root", "redhat123")
        width, height = self.get_win_size()

        chan = ssh.invoke_shell(term='xterm', width=width, height=height)
        # self.socketio.start_background_task(self.send_data, self.clients[request.sid]["chan"])
        # self.chan.settimeout(0.1)
        return chan

    def proxy(self, ws, chan, room_id):
        while True:
            data = chan.recv(1024)
            if len(data) == 0:
                ws.emit(event='logout', data={'room': room_id}, room=room_id)
                break
            ws.emit(event="data", data={"data": data.decode(), "room": room_id}, room=room_id)

    def new_connection(self):
        self.connections[request.sid] = dict()

    def new_room(self):
        room_id = str(uuid.uuid4())
        room = {
            "id": room_id,
            "proxy": None,
            "client": None,
            "forwarder": None,
            "request": self.ssh_with_password(self, room_id),
            "cols": 80,
            "rows": 24
        }
        self.connections[request.sid][room_id] = room
        return room

    @staticmethod
    def get_win_size():
        cols_request = request.cookies.get('cols')
        rows_request = request.cookies.get('rows')
        print("GET WIN SIZE")
        print(cols_request)
        print(rows_request)
        if cols_request and cols_request.isdigit():
            cols = int(cols_request)
        else:
            cols = 80

        if rows_request and rows_request.isdigit():
            rows = int(rows_request)
        else:
            rows = 24
        return cols, rows

    def on_connect(self):
        print("On connect event trigger")
        self.new_connection()

    def on_host(self, message):
        # 此处获取主机的信息
        print("On host event trigger")
        asset_id = message.get('uuid', None)
        user_id = message.get('userid', None)
        secret = message.get('secret', None)
        room = self.new_room()

        self.emit('room', {'room': room["id"], 'secret': secret})
        print("Join room: {}".format(room["id"]))
        join_room(room["id"])
        if not asset_id or not user_id:
            return
        self.socketio.start_background_task(
            self.proxy, self, room["request"], room["id"]
        )

    def on_data(self, message):
        """
        收到浏览器请求
        :param message: {"data": "xxx", "room": "xxx"}
        :return:
        """
        room_id = message.get('room')
        room = self.connections.get(request.sid, {}).get(room_id)
        if not room:
            return
        room["request"].send(message['data'])

    def on_token(self, message):
        # 此处获取token含有的主机的信息
        print("On token trigger")
        token = message.get('token', None)
        secret = message.get('secret', None)
        room = self.new_room()
        self.emit('room', {'room': room["id"], 'secret': secret})
        if not token or not secret:
            print("Token or secret is None")
            self.emit('data', {'data': "\nOperation not permitted!",
                               'room': room["id"]})
            self.emit('disconnect')
            return None

        info = self.app.service.get_token_asset(token)
        print(info)
        if not info:
            print("Token info is None")
            self.emit('data', {'data': "\nOperation not permitted!",
                               'room': room["id"]})
            self.emit('disconnect')
            return None

        user_id = info.get('user', None)
        self.current_user = self.app.service.get_user_profile(user_id)
        room["request"].user = self.current_user
        print(self.current_user)
        self.on_host({
            'secret': secret,
            'uuid': info['asset'],
            'userid': info['system_user'],
        })

    def on_resize(self, message):
        cols, rows = message.get('cols', None), message.get('rows', None)
        print("On resize event trigger: {}*{}".format(cols, rows))

        time.sleep(0.2)
        rooms = self.connections.get(request.sid)
        if not rooms:
            return
        room_tmp = list(rooms.values())[0]
        print(room_tmp["cols"], room_tmp["rows"])
        if (room_tmp["cols"], room_tmp["rows"]) != (cols, rows):
            for room in rooms.values():
                room["request"].resize_pty(width=cols, height=rows)
                # room["request"].change_size_event.set()
                # room.update({"cols": cols, "rows": rows})

    def on_disconnect(self):
        print("On disconnect event trigger")
        # self.on_leave(self.clients[request.sid]["room"])
        rooms = {k: v for k, v in self.connections.get(request.sid, {}).items()}
        for room_id in rooms:
            self.on_logout(room_id)
        del self.connections[request.sid]

    def on_logout(self, room_id):
        print("On logout event trigger")
        room = self.connections.get(request.sid, {}).get(room_id)
        if room:
            del self.connections[request.sid][room_id]
            del room


@app.route('/luna/<path:path>')
def send_js(path):
    return send_from_directory('dist', path)


@app.route('/api/perms/v1/user/nodes-assets/')
def asset_groups_assets():
    assets = [
        {
            'assets_amount': 0,
            'assets_granted': [],
            'id': '3ea680e3-7a7b-49c3-908b-ffec3b349f28',
            'key': '0:15:1',
            'name': '新节点 25',
            'parent': '181a066e-7f02-4b12-bc4a-80eb990d7830',
            'value': '新节点 25'
        },
        {
            'assets_amount': 1,
            'assets_granted': [
                {
                    'comment': '',
                    'domain': None,
                    'hostname': 'widnows',
                    'id': '9fcd7a09-a171-4cb7-b2f9-a025754f8635',
                    'ip': '192.168.1.179',
                    'is_active': True,
                    'nodes': [{
                        'assets_amount': 1,
                        'id': '181a066e-7f02-4b12-bc4a-80eb990d7830',
                        'is_node': True,
                        'key': '0:15',
                        'parent': 'cf461e12-787e-451c-857a-db5503ee1bd2',
                        'value': 'windows'}],
                    'os': None,
                    'platform': 'Windows',
                    'port': 3389,
                    'system_users_granted': [{
                        'comment': '',
                        'id': 'd95e223e-0539-48a1-864d-6709a0cc6ec0',
                        'name': 'windows',
                        'priority': 10,
                        'protocol': 'rdp',
                        'username': 'guanghongwei'}],
                    'system_users_join': 'guanghongwei'
                }
            ],
            'id': '181a066e-7f02-4b12-bc4a-80eb990d7830',
            'key': '0:15',
            'name': 'windows',
            'parent': 'cf461e12-787e-451c-857a-db5503ee1bd2',
            'value': 'windows'},
       {'assets_amount': 0,
        'assets_granted': [],
        'id': '35e82765-8595-479a-a304-1c44433be955',
        'key': '0:11:0:1:0',
        'name': '新节点 22',
        'parent': 'c7705b0d-56b1-479e-a2a6-6a2f381f0232',
        'value': '新节点 22'},
       {'assets_amount': 0,
        'assets_granted': [],
        'id': '4d976d17-a2ad-4532-b729-0ce18bb1011e',
        'key': '0:11:0:0',
        'name': '新节点 13',
        'parent': '26410e6f-b833-433b-a804-b8b235bffc49',
        'value': '新节点 13'},
       {'assets_amount': 0,
        'assets_granted': [],
        'id': 'c7705b0d-56b1-479e-a2a6-6a2f381f0232',
        'key': '0:11:0:1',
        'name': '新节点 21',
        'parent': '26410e6f-b833-433b-a804-b8b235bffc49',
        'value': '新节点 21'},
       {'assets_amount': 15,
        'assets_granted': [{'comment': '',
          'domain': None,
          'hostname': 'guagua5服务器',
          'id': '06547347-ad7a-4577-943e-6d9b29655b17',
          'ip': '192.168.244.182',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua3',
          'id': '50b0d171-41a2-4767-96c8-f2532036dcd9',
          'ip': '192.168.244.180',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua10嘎嘎',
          'id': '58b3ef97-fb52-41c0-81de-4505ab1ebff8',
          'ip': '192.168.244.187',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': '79f6f79a-6fa2-4fb2-ae7b-ab4a730131e3',
          'hostname': 'centos.fit2cloud.com.xxx.whoami.ggg',
          'id': '5c5aaeaa-6324-4246-b836-5935836e2a30',
          'ip': '127.0.0.1',
          'is_active': True,
          'nodes': [{'assets_amount': 1,
            'id': '0bd0ce70-ed45-4201-b8e4-7062cf456d76',
            'is_node': True,
            'key': '0:6:0',
            'parent': 'bff42eef-37e2-476e-a0b0-27637f4ccf02',
            'value': '新节点 7'},
           {'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'},
           {'assets_amount': 16,
            'id': 'cf461e12-787e-451c-857a-db5503ee1bd2',
            'is_node': True,
            'key': '0',
            'parent': 'cf461e12-787e-451c-857a-db5503ee1bd2',
            'value': 'ROOT'}],
          'os': 'CentOS',
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua1',
          'id': '63f6fb16-0331-42d9-b5c9-6805bf45534f',
          'ip': '192.168.244.178',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua14',
          'id': '6cf174f3-97ef-47de-be56-d15972a3e1b7',
          'ip': '192.168.244.191',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua12',
          'id': '771f9e8b-19a7-429c-8d19-920fefce0518',
          'ip': '192.168.244.189',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua6',
          'id': 'a1330e54-b5dc-4634-ae68-29fb8fbd0307',
          'ip': '192.168.244.183',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua4',
          'id': 'b1291272-0f2a-4a24-bde5-b317a74c50b1',
          'ip': '192.168.244.181',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua8',
          'id': 'cea1f081-098a-4d1f-b7c3-cf5977f5e6e4',
          'ip': '192.168.244.185',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua11',
          'id': 'd490c8d0-5ac9-4eb4-8aed-e5eda79a4f7c',
          'ip': '192.168.244.188',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua7',
          'id': 'f586a600-cc85-4e22-adf1-22c7f1631f4a',
          'ip': '192.168.244.184',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua9',
          'id': 'f5a9d5b8-524e-4a85-b8ed-da9db81fa2cc',
          'ip': '192.168.244.186',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua2',
          'id': 'fcddcb81-bc1f-4f76-af2b-67b1daa105b0',
          'ip': '192.168.244.179',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'},
         {'comment': '',
          'domain': None,
          'hostname': 'guagua13',
          'id': 'fda85d33-6ae9-47ec-b910-fe542441c824',
          'ip': '192.168.244.190',
          'is_active': True,
          'nodes': [{'assets_amount': 15,
            'id': '26410e6f-b833-433b-a804-b8b235bffc49',
            'is_node': True,
            'key': '0:11:0',
            'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
            'value': '新节点 12'}],
          'os': None,
          'platform': 'Linux',
          'port': 22,
          'system_users_granted': [{'comment': '',
            'id': '070a4791-36c9-4952-998b-7e5131ec2cd0',
            'name': 'web',
            'priority': 10,
            'protocol': 'ssh',
            'username': 'web'}],
          'system_users_join': 'web'}],
        'id': '26410e6f-b833-433b-a804-b8b235bffc49',
        'key': '0:11:0',
        'name': '新节点 12',
        'parent': '9e1a60f6-6c55-4fed-ac39-cc786942cfc0',
        'value': '新节点 12'},
       {'assets_amount': 0,
        'assets_granted': [],
        'id': '2abfa1bc-bfd1-4aa3-a864-c3ad59a324da',
        'key': '',
        'name': 'Unnode',
        'parent': 'cf461e12-787e-451c-857a-db5503ee1bd2',
        'value': 'Unnode'}]
    return jsonify(assets)


@app.route('/api/users/v1/profile/')
def user_profile():
    assets = {
        "id": "4fc67feb-9efa-4e7b-94b0-b73356a87b2e",
        "username": "admin",
        "name": "Administrator",
        "email": "admin@mycomany.com",
        "is_active": True,
        "is_superuser": True,
        "role": "Administrator",
        "groups": [
            "Default"
        ],
        "wechat": "",
        "phone": 13888888888,
        "comment": "",
        "date_expired": "2087-12-16 07:41:35"
    }
    return jsonify(assets)


@app.route('/api/terminal/v1/sessions/test/replay/')
def replay():
    return redirect("http://jps.ilz.me/media/2017-12-24/ec87a486-0344-4f12-b27a-620321944f7f.gz")


@app.route('/api/terminal/v2/sessions/<pk>/replay/')
def get_session_replay(pk):
    # return jsonify({
    #   'type': 'guacamole',
    #   'src': 'http://localhost/media/2018-05-07/5c205f0a-b5ae-405a-9444-c0d59262ec29.gz',
    #   'status': 'DONE'
    # })
    return jsonify({
       'type': 'json',
       'src': 'http://localhost/media/2018-05-02/dbd5302d-7861-4810-b555-5fe71e26ccc3.gz',
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
