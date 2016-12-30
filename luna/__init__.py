#!/usr/bin/env python
# ~*~ coding: utf-8 ~*~
#

from flask import Flask
from flask_socketio import SocketIO

from apps.ssh_server.utils import AppRequest
from .conf import CONFIG

app = Flask(__name__, template_folder='dist')
app.config.from_object(CONFIG)
socket_io = SocketIO(app)
api = AppRequest(app.config['NAME'])

from . import authentication, views
