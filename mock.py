#!/usr/bin/env python3

from flask import Flask, send_from_directory, render_template, request, jsonify, redirect, url_for
from flask_socketio import SocketIO, Namespace, emit, join_room, leave_room
import paramiko
import uuid

app = Flask(__name__, template_folder='dist')


class SSHws(Namespace):
  def __init__(self, *args, **kwargs):
    self.clients = dict()
    super().__init__(*args, **kwargs)

  def ssh_with_password(self):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("127.0.0.1", 22, "liuzheng", "liuzheng")
    self.clients[request.sid]["chan"] = ssh.invoke_shell(term='xterm', width=self.clients[request.sid]["cols"],
                                                         height=self.clients[request.sid]["rows"])
    # self.socketio.start_background_task(self.send_data, self.clients[request.sid]["chan"])
    # self.chan.settimeout(0.1)

  def send_data(self, s):
    while True:
      for sid in self.clients:
        try:
          if self.clients[sid]["chan"]:
            data = self.clients[sid]["chan"].recv(2048).decode('utf-8', 'replace')
            s.emit(event='data', data=data, room=self.clients[sid]["room"])
        except RuntimeError:
          print(data)
          print(self.clients)

  def on_connect(self):
    print(request.sid)
    self.clients[request.sid] = {
      "cols": int(request.cookies.get('cols', 80)),
      "rows": int(request.cookies.get('rows', 24)),
      "room": str(uuid.uuid4()),
      "chan": None
    }
    join_room(self.clients[request.sid]["room"])
    self.socketio.start_background_task(self.send_data, self)

  def on_data(self, message):
    self.clients[request.sid]["chan"].send(message)

  def on_host(self, message):
    # self.clients[request.sid]["room"] = str(uuid.uuid4())
    # self.emit('room', self.clients[request.sid]["chan"]["room"])
    # join_room(self.clients[request.sid]["room"])
    self.ssh_with_password()
    print(message, self.clients[request.sid]["room"])

  def on_resize(self, message):
    self.clients[request.sid]["cols"] = message.get('cols', 80)
    self.clients[request.sid]["rows"] = message.get('rows', 24)
    self.clients[request.sid]["chan"].resize_pty(width=self.clients[request.sid]["rows"],
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

  def on_disconnect(self):
    print("disconnect")
    pass

  def on_leave(self):
    leave_room(self.room)


@app.route('/luna/<path:path>')
def send_js(path):
  return send_from_directory('dist', path)


@app.route('/')
@app.route('/luna/')
def index():
  return render_template('index.html')


@app.route('/api/perms/v1/user/my/asset-groups-assets/')
def asset_groups_assets():
  assets = [
    {
      "id": 0,
      "name": "ungrouped",
      "assets": []
    },
    {
      "id": 1,
      "name": "Default",
      "comment": "Default asset group",
      "assets_granted": [
        {
          "id": 2,
          "hostname": "192.168.1.6",
          "ip": "192.168.2.6",
          "port": 22,
          "system": "linux",
          "system_users_granted": [
            {
              "id": 1,
              "name": "web",
              "username": "web",
              "protocol": "ssh",
              "auth_method": "P",
              "auto_push": True
            }
          ]
        },
        {
          "id": 4,
          "hostname": "windows server",
          "ip": "123.57.183.135",
          "port": 3389,
          "system": "windows",
          "assets_granted": [
            {
              "id": 1,
              "name": "web",
              "username": "web",
              "protocol": "ssh",
              "auth_method": "P",
              "auto_push": True
            }
          ]
        }
      ]
    },
    {
      "id": 4,
      "name": "java",
      "comment": "",
      "assets_granted": [
        {
          "id": 2,
          "hostname": "192.168.1.6",
          "ip": "192.168.2.6",
          "port": 22,
          "system_users_granted": [
            {
              "id": 1,
              "name": "web",
              "username": "web",
              "protocol": "ssh",
              "auth_method": "P",
              "auto_push": True
            }
          ]
        }
      ]
    },
    {
      "id": 3,
      "name": "数据库",
      "comment": "",
      "assets_granted": [
        {
          "id": 2,
          "hostname": "192.168.1.6",
          "ip": "192.168.2.6",
          "port": 22,
          "system_users_granted": [
            {
              "id": 1,
              "name": "web",
              "username": "web",
              "protocol": "ssh",
              "auth_method": "P",
              "auto_push": True
            }
          ]
        }
      ]
    },
    {
      "id": 2,
      "name": "运维组",
      "comment": "",
      "assets_granted": [
        {
          "id": 2,
          "hostname": "192.168.1.6",
          "ip": "192.168.2.6",
          "port": 22,
          "system_users_granted": [
            {
              "id": 1,
              "name": "web",
              "username": "web",
              "protocol": "ssh",
              "auth_method": "P",
              "auto_push": True
            }
          ]
        }
      ]
    }
  ]
  return jsonify(assets)


@app.route('/api/terminal/v1/sessions/test/replay/')
def replay():
  return redirect("http://jps.ilz.me/media/2017-12-24/ec87a486-0344-4f12-b27a-620321944f7f.gz")


if __name__ == '__main__':
  socketio = SocketIO(app)
  socketio.on_namespace(SSHws('/ssh'))
  socketio.run(app)
