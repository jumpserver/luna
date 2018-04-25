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
      "id": 0,
      "name": "ungrouped",
      "assets": []
    },
    {
      "id": 1,
      "name": "Default long name long name long name",
      "comment": "Default asset group",
      "assets_granted": [
        {
          "id": 1,
          "hostname": "192.168.1.6",
          "ip": "192.168.2.6",
          "port": 22,
          "platform": "Linux",
          "system_users_granted": [
            {
              "id": 1,
              "name": "web",
              "username": "web",
              "protocol": "ssh",
              "auth_method": "P",
              "auto_push": True,
              "priority": 10
            },
            {
              "id": 2,
              "name": "liuzheng",
              "username": "liuzheng",
              "protocol": "ssh",
              "auth_method": "P",
              "auto_push": True,
              "priority": 10

            }],
        },
        {
          "id": 44,
          "hostname": "192.168.1.6 long name long name long name long name long name",
          "ip": "192.168.2.6",
          "port": 22,
          "platform": "Linux",
          "system_users_granted": [
            {
              "id": 1,
              "name": "web",
              "username": "web",
              "protocol": "ssh",
              "auth_method": "P",
              "auto_push": True,
              "priority": 1
            },
            {
              "id": 2,
              "name": "liuzheng",
              "username": "liuzheng",
              "protocol": "ssh",
              "auth_method": "P",
              "auto_push": True,
              "priority": 10

            }
          ]
        },
        {
          "id": 4,
          "hostname": "windows server",
          "ip": "123.57.183.135",
          "port": 3389,
          "platform": "Windows",
          "system_users_granted": [
            {
              "id": "3",
              "name": "web",
              "username": "web",
              "protocol": "rdp",
              "auth_method": "P",
              "auto_push": True,
              "priority": 10
            }
          ]
        }
      ]
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
