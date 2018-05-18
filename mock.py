#!/usr/bin/env python3

from flask import Flask, send_from_directory, render_template, request, jsonify, redirect, send_file
from flask_socketio import SocketIO, Namespace, emit, join_room, leave_room
import paramiko
import uuid
import eventlet
from threading import Lock
from flask import Flask, request, current_app, redirect

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
        # eventlet.monkey_patch(thread=True, select=True, socket=True)
        while True:
            data = chan.recv(1024)
            socketio.sleep(1)
            if len(data) == 0:
                break
            ws.emit(event="data", data={"data": data.decode(), "room": room_id}, room=room_id, namespace='/ssh')

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
        # self.connections[request.sid] = connection
        # self.rooms[connection['room']] = {
        #     "admin": request.sid,
        #     "member": [],
        #     "rw": []
        # }
        # join_room(connection['room'])

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
            # self.on_connect()
            return
        global thread
        if thread is None:
            thread = self.socketio.start_background_task(
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
        rooms = self.connections.get(request.sid)

        if not rooms:
            return

        room_tmp = list(rooms.values())[0]
        if (room_tmp["cols"], room_tmp["rows"]) != (cols, rows):
            for room in rooms.values():
                room["request"].resize_pty(width=cols, height=rows)
                # room["request"].change_size_event.set()
                # room.update({"cols": cols, "rows": rows})

    # def on_room(self, session_id):
    #     print("On room event trigger")
    #     if session_id not in self.connections.keys():
    #         self.emit(
    #             'error', "no such session",
    #             room=self.connections[request.sid]["room"]
    #         )
    #     else:
    #         self.emit(
    #             'room', self.connections[session_id]["room"],
    #             room=self.connections[request.sid]["room"]
    #         )
    #
    # def on_join(self, room):
    #     print("On join room event trigger")
    #     self.on_leave(self.connections[request.id]["room"])
    #     self.connections[request.sid]["room"] = room
    #     self.rooms[room]["member"].append(request.sid)
    #     join_room(room=room)
    #
    # def on_leave(self, room):
    #     print("On leave room event trigger")
    #     if self.rooms[room]["admin"] == request.sid:
    #         self.emit("data", "\nAdmin leave", room=room)
    #         del self.rooms[room]
    #     leave_room(room=room)

    def on_disconnect(self):
        print("On disconnect event trigger")
        # self.on_leave(self.clients[request.sid]["room"])
        for room in self.connections.get(request.sid, {}):
            self.on_logout(room["id"])
        del self.connections[request.sid]

    def on_logout(self, room_id):
        print("On logout event trigger")
        room = self.connections.get(request.sid, {}).get(room_id)
        if room:
            room["proxy"].close()
            del self.connections[request.sid][room_id]
            del room


@app.route('/luna/<path:path>')
def send_js(path):
    return send_from_directory('dist', path)


@app.route('/api/perms/v1/user/nodes-assets/')
def asset_groups_assets():
    assets = [
        {
            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
            "key": "0:11:77",
            "name": "新节点 12",
            "value": "新节点 12",
            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
            "assets_granted": [
                {
                    "id": "1600ed6d-e3b6-434c-a960-c5bb818806b6",
                    "hostname": "windows1",
                    "ip": "10.1.10.178",
                    "port": 3389,
                    "system_users_granted": [
                        {
                            "id": "8763b81a-bb5e-484a-abca-10514c7bb185",
                            "name": "组织1-部门1-Administrator",
                            "username": "Administrator",
                            "priority": 10,
                            "protocol": "rdp",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "Administrator",
                    "os": "",
                    "domain": "",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "key": "0:11",
                            "value": "网域测试",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Windows",
                    "comment": ""
                },
                {
                    "id": "b952a481-a624-467e-b97f-9435155f0d53",
                    "hostname": "testserver",
                    "ip": "10.1.10.192",
                    "port": 22,
                    "system_users_granted": [
                        {
                            "id": "7e326f71-aee5-4688-8cc1-717919470a09",
                            "name": "root",
                            "username": "root",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "root, zbh",
                    "os": "CentOS",
                    "domain": "",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "key": "0:11",
                            "value": "网域测试",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "key": "0",
                            "value": "Fit2cloud",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Linux",
                    "comment": ""
                },
                {
                    "id": "9fcd7a09-a171-4cb7-b2f9-a025754f8635",
                    "hostname": "ali-windows",
                    "ip": "47.104.206.228",
                    "port": 3389,
                    "system_users_granted": [
                        {
                            "id": "8763b81a-bb5e-484a-abca-10514c7bb185",
                            "name": "组织1-部门1-Administrator",
                            "username": "Administrator",
                            "priority": 10,
                            "protocol": "rdp",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "Administrator",
                    "os": "",
                    "domain": "",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "key": "0",
                            "value": "Fit2cloud",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Windows",
                    "comment": ""
                },
                {
                    "id": "b6f16269-d02a-4055-9cd8-460fa10b1540",
                    "hostname": "test-vm3",
                    "ip": "172.19.185.8",
                    "port": 22,
                    "system_users_granted": [
                        {
                            "id": "7e326f71-aee5-4688-8cc1-717919470a09",
                            "name": "root",
                            "username": "root",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "root, zbh",
                    "os": "",
                    "domain": "8789580f-b5ca-4478-b6d3-d0dafc4c48e8",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "key": "0:11",
                            "value": "网域测试",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Linux",
                    "comment": ""
                },
                {
                    "id": "27e50edc-52d9-41ef-8c9e-1bff9d1628b2",
                    "hostname": "test-vm2",
                    "ip": "172.19.185.7",
                    "port": 22,
                    "system_users_granted": [
                        {
                            "id": "7e326f71-aee5-4688-8cc1-717919470a09",
                            "name": "root",
                            "username": "root",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        },
                    ],
                    "is_active": True,
                    "system_users_join": "root, zbh",
                    "os": "",
                    "domain": "8789580f-b5ca-4478-b6d3-d0dafc4c48e8",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "key": "0:11",
                            "value": "网域测试",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Linux",
                    "comment": ""
                },
                {
                    "id": "9ef36bb3-1bed-455f-be09-3770d3f4bf97",
                    "hostname": "test-vm1",
                    "ip": "172.19.185.6",
                    "port": 22,
                    "system_users_granted": [
                        {
                            "id": "7e326f71-aee5-4688-8cc1-717919470a09",
                            "name": "root",
                            "username": "root",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        },
                        {
                            "id": "17f384f4-683d-4944-a38d-db73608b92a9",
                            "name": "zbh-test",
                            "username": "zbh",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "root, zbh",
                    "os": "",
                    "domain": "8789580f-b5ca-4478-b6d3-d0dafc4c48e8",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "key": "0:11",
                            "value": "网域测试",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Linux",
                    "comment": ""
                }
            ],
            "assets_amount": 6
        },
        {
            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
            "key": "0:11",
            "name": "网域测试",
            "value": "网域测试",
            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
            "assets_granted": [
                {
                    "id": "1600ed6d-e3b6-434c-a960-c5bb818806b6",
                    "hostname": "windows1",
                    "ip": "10.1.10.178",
                    "port": 3389,
                    "system_users_granted": [
                        {
                            "id": "8763b81a-bb5e-484a-abca-10514c7bb185",
                            "name": "组织1-部门1-Administrator",
                            "username": "Administrator",
                            "priority": 10,
                            "protocol": "rdp",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "Administrator",
                    "os": "",
                    "domain": "",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "key": "0:11",
                            "value": "网域测试",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Windows",
                    "comment": ""
                },
                {
                    "id": "b952a481-a624-467e-b97f-9435155f0d53",
                    "hostname": "testserver",
                    "ip": "10.1.10.192",
                    "port": 22,
                    "system_users_granted": [
                        {
                            "id": "7e326f71-aee5-4688-8cc1-717919470a09",
                            "name": "root",
                            "username": "root",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "root, zbh",
                    "os": "CentOS",
                    "domain": "",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "key": "0:11",
                            "value": "网域测试",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "key": "0",
                            "value": "Fit2cloud",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Linux",
                    "comment": ""
                },
                {
                    "id": "b6f16269-d02a-4055-9cd8-460fa10b1540",
                    "hostname": "test-vm3",
                    "ip": "172.19.185.8",
                    "port": 22,
                    "system_users_granted": [
                        {
                            "id": "7e326f71-aee5-4688-8cc1-717919470a09",
                            "name": "root",
                            "username": "root",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        },
                        {
                            "id": "17f384f4-683d-4944-a38d-db73608b92a9",
                            "name": "zbh-test",
                            "username": "zbh",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "root, zbh",
                    "os": "",
                    "domain": "8789580f-b5ca-4478-b6d3-d0dafc4c48e8",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "key": "0:11",
                            "value": "网域测试",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Linux",
                    "comment": ""
                },
                {
                    "id": "27e50edc-52d9-41ef-8c9e-1bff9d1628b2",
                    "hostname": "test-vm2",
                    "ip": "172.19.185.7",
                    "port": 22,
                    "system_users_granted": [
                        {
                            "id": "7e326f71-aee5-4688-8cc1-717919470a09",
                            "name": "root",
                            "username": "root",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        },
                        {
                            "id": "17f384f4-683d-4944-a38d-db73608b92a9",
                            "name": "zbh-test",
                            "username": "zbh",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "root, zbh",
                    "os": "",
                    "domain": "8789580f-b5ca-4478-b6d3-d0dafc4c48e8",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "key": "0:11",
                            "value": "网域测试",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Linux",
                    "comment": ""
                },
                {
                    "id": "9ef36bb3-1bed-455f-be09-3770d3f4bf97",
                    "hostname": "test-vm1",
                    "ip": "172.19.185.6",
                    "port": 22,
                    "system_users_granted": [
                        {
                            "id": "7e326f71-aee5-4688-8cc1-717919470a09",
                            "name": "root",
                            "username": "root",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        },
                        {
                            "id": "17f384f4-683d-4944-a38d-db73608b92a9",
                            "name": "zbh-test",
                            "username": "zbh",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "root, zbh",
                    "os": "",
                    "domain": "8789580f-b5ca-4478-b6d3-d0dafc4c48e8",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "key": "0:11",
                            "value": "网域测试",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Linux",
                    "comment": ""
                }
            ],
            "assets_amount": 5
        },
        {
            "id": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
            "key": "0",
            "name": "Fit2cloud",
            "value": "Fit2cloud",
            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
            "assets_granted": [
                {
                    "id": "b952a481-a624-467e-b97f-9435155f0d53",
                    "hostname": "testserver",
                    "ip": "10.1.10.192",
                    "port": 22,
                    "system_users_granted": [
                        {
                            "id": "7e326f71-aee5-4688-8cc1-717919470a09",
                            "name": "root",
                            "username": "root",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        },
                        {
                            "id": "17f384f4-683d-4944-a38d-db73608b92a9",
                            "name": "zbh-test",
                            "username": "zbh",
                            "priority": 10,
                            "protocol": "ssh",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "root, zbh",
                    "os": "CentOS",
                    "domain": "",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "key": "0:11",
                            "value": "网域测试",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "key": "0",
                            "value": "Fit2cloud",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Linux",
                    "comment": ""
                },
                {
                    "id": "ad594b10-9f64-4913-b7b1-135fe63561d1",
                    "hostname": "ali-windows",
                    "ip": "47.104.206.228",
                    "port": 3389,
                    "system_users_granted": [
                        {
                            "id": "8763b81a-bb5e-484a-abca-10514c7bb185",
                            "name": "组织1-部门1-Administrator",
                            "username": "Administrator",
                            "priority": 10,
                            "protocol": "rdp",
                            "comment": ""
                        }
                    ],
                    "is_active": True,
                    "system_users_join": "Administrator",
                    "os": "",
                    "domain": "",
                    "nodes": [
                        {
                            "id": "67f92d6c-0f91-4d20-a0e4-ac83b7dd02b6",
                            "key": "0:11:77",
                            "value": "新节点 12",
                            "parent": "9c83d432-a353-4a4e-9fd9-be27a5851c2d",
                            "assets_amount": 6,
                            "is_asset": False
                        },
                        {
                            "id": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "key": "0",
                            "value": "Fit2cloud",
                            "parent": "be9d9c3a-68d0-40ec-887c-5815d68e2f2c",
                            "assets_amount": 6,
                            "is_asset": False
                        }
                    ],
                    "platform": "Windows",
                    "comment": ""
                }
            ],
            "assets_amount": 2
        }
    ]
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
    async_mode = 'threading'
    socketio = SocketIO(app, async_mode=async_mode)
    socketio.on_namespace(SSHws('/ssh'))
    socketio.run(app, debug=True)
