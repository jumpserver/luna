#!/usr/bin/env python3

from flask import Flask, send_from_directory, render_template, request, jsonify
from flask_socketio import SocketIO, Namespace, emit, join_room, leave_room
import paramiko
import uuid

app = Flask(__name__, template_folder='dist')


class SSHws(Namespace):
  def ssh_with_password(self):
    self.ssh = paramiko.SSHClient()
    self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    self.ssh.connect("127.0.0.1", 22, "liuzheng", "liuzheng")
    self.chan = self.ssh.invoke_shell(term='xterm', width=self.cols, height=self.rows)
    self.socketio.start_background_task(self.send_data)
    # self.chan.settimeout(0.1)

  def send_data(self):
    while True:
      data = self.chan.recv(2048).decode('utf-8', 'replace')
      self.emit(event='data', data=data, room=self.room)

  def on_connect(self):
    self.cols = int(request.cookies.get('cols', 80))
    self.rows = int(request.cookies.get('rows', 24))

  def on_data(self, message):
    self.chan.send(message)

  def on_host(self, message):
    self.room = str(uuid.uuid4())
    self.emit('room', self.room)
    join_room(self.room)
    self.ssh_with_password()
    print(message, self.room)

  def on_resize(self, message):
    print(message)
    self.cols = message.get('cols', 80)
    self.rows = message.get('rows', 24)
    self.chan.resize_pty(width=self.cols, height=self.rows, width_pixels=1, height_pixels=1)

  def on_disconnect(self):
    pass

  def on_join(self, room):
    join_room(room)
    self.room = room

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
          "hostname": "testserver123",
          "ip": "123.57.183.135",
          "port": 8022,
          "system": "linux",
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


if __name__ == '__main__':
  socketio = SocketIO(app)
  socketio.on_namespace(SSHws('/ssh'))
  socketio.run(app)
