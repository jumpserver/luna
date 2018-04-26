#!/usr/bin/env python3

from flask import Flask, send_from_directory, render_template, request, jsonify, redirect, send_file
from flask_socketio import SocketIO, Namespace, emit, join_room, leave_room
import paramiko
import uuid
from flask import Flask, request, current_app, redirect

app = Flask(__name__, template_folder='dist')


class SSHws(Namespace):
  def __init__(self, *args, **kwargs):
    self.clients = dict()
    super().__init__(*args, **kwargs)

  def ssh_with_password(self, connection):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("127.0.0.1", 22, "liuzheng", "liuzheng")
    self.clients[request.sid]["chan"][connection] = ssh.invoke_shell(term='xterm',
                                                                     width=self.clients[request.sid]["cols"],
                                                                     height=self.clients[request.sid]["rows"])
    # self.socketio.start_background_task(self.send_data, self.clients[request.sid]["chan"])
    # self.chan.settimeout(0.1)
    self.socketio.start_background_task(self.sent_data, self, self.clients[request.sid]["chan"][connection],
                                        self.clients[request.sid]["room"],
                                        connection, request.sid)

  def sent_data(self, s, chan, room, connection, sid):
    while True:
      if connection not in s.clients[sid]["chan"].keys():
        return
      try:
        data = chan.recv(2048).decode('utf-8', 'replace')
        s.emit(event='data', data={"data": data, "room": connection}, room=room)
      except RuntimeError:
        print(room, connection)

  def send_data(self, s):
    # Todo: 这里涉及到并发优化
    while True:
      for sid in self.clients:
        if self.clients[sid]["chan"]:
          for room, chan in self.clients[sid]["chan"]:
            try:
              data = chan.recv(2048).decode('utf-8', 'replace')
              s.emit(event='data', data={"data": data, "room": room}, room=self.clients[sid]["room"])
            except RuntimeError:
              print(self.clients)

  def on_connect(self):
    self.clients[request.sid] = {
      "cols": int(request.cookies.get('cols', 80)),
      "rows": int(request.cookies.get('rows', 24)),
      "room": str(uuid.uuid4()),
      "chan": dict()
    }
    print(request.sid)
    join_room(self.clients[request.sid]["room"])
    # self.socketio.start_background_task(self.send_data, self)

  def on_data(self, message):
    self.clients[request.sid]["chan"][message["room"]].send(message["data"])

  def on_host(self, message):
    connection = str(uuid.uuid4())
    self.emit('room', {'room': connection, 'secret': message['secret']})
    self.ssh_with_password(connection)

  def on_resize(self, message):
    self.clients[request.sid]["cols"] = message.get('cols', 80)
    self.clients[request.sid]["rows"] = message.get('rows', 24)
    for room in self.clients[request.sid]["chan"]:
      self.clients[request.sid]["chan"][room].resize_pty(width=self.clients[request.sid]["cols"],
                                                         height=self.clients[request.sid]["rows"], width_pixels=1,
                                                         height_pixels=1)

  def on_room(self, sessionid):
    if sessionid not in self.clients.keys():
      self.emit('error', "no such session", room=self.clients[request.sid]["room"])
    else:
      self.emit('room', self.clients[sessionid]["room"], room=self.clients[request.sid]["room"])

  def on_join(self, room):
    self.leave_room(room=self.clients[request.sid]["room"])
    join_room(room)

  def on_token(self, token):
    self.on_host(token)

  def on_disconnect(self):
    print("disconnect")
    for connection in self.clients[request.sid]["chan"]:
      self.clients[request.sid]["chan"][connection].close()
    del self.clients[request.sid]["chan"]
    pass

  def on_leave(self):
    leave_room(self.room)

  def on_logout(self, connection):
    print("logout", connection)
    if connection:
      self.clients[request.sid]["chan"][connection].close()
      del self.clients[request.sid]["chan"][connection]


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


@app.route('/luna/i18n/<i18n>')
def i18n(i18n):
  return send_file('./i18n/' + i18n)


def read_file(filename, charset='utf-8'):
  with open(filename, 'r') as f:
    return f.read().decode(charset)


if __name__ == '__main__':
  socketio = SocketIO(app)
  socketio.on_namespace(SSHws('/ssh'))
  socketio.run(app)
