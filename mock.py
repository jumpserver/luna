#!/usr/bin/env python3

from flask import Flask, send_from_directory, render_template, jsonify
from flask_socketio import SocketIO, Namespace, emit

app = Flask(__name__, template_folder='dist')


class SSHws(Namespace):
  def on_connect(self):
    pass

  def on_data(self, message):
    print(message)

  def on_disconnect(self):
    pass


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
      "assets": [
        {
          "id": 2,
          "hostname": "192.168.1.6",
          "ip": "192.168.2.6",
          "port": 22,
          "system": "windows",
          "system_users": [
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
          "system_users": [
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
      "assets": [
        {
          "id": 2,
          "hostname": "192.168.1.6",
          "ip": "192.168.2.6",
          "port": 22,
          "system_users": [
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
      "assets": [
        {
          "id": 2,
          "hostname": "192.168.1.6",
          "ip": "192.168.2.6",
          "port": 22,
          "system_users": [
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
      "assets": [
        {
          "id": 2,
          "hostname": "192.168.1.6",
          "ip": "192.168.2.6",
          "port": 22,
          "system_users": [
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
