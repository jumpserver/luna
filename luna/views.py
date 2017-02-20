#!/usr/bin/env python
# coding: utf-8

import time
import select
import threading
import collections

import paramiko
from flask.globals import _request_ctx_stack, _app_ctx_stack
from flask import request
from flask import render_template, send_from_directory, jsonify, g
from flask_socketio import emit

from . import app, socket_io

thread = None

clients = collections.defaultdict(dict)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/get_site')
def get_site():
    return jsonify({"hello": "world"})


@app.route('/bifrost/')
def bifrost():
    return render_template('index.html')


@app.route('/bifrost/<path:path>')
def send_dist(path):
    return send_from_directory('dist', path)


@socket_io.on('api')
def handle_api(sid, api):
    if api == 'nav':
        socket_io.emit('nav',
             '[{"id":"File","name":"Server","children":[{"id":"NewConnection","href":"Aaaa","name":"New connection","disable":true},{"id":"Connect","href":"Aaaa","name":"Connect","disable":true},{"id":"Disconnect","click":"Disconnect","name":"Disconnect"},{"id":"DisconnectAll","click":"DisconnectAll","name":"Disconnect all"},{"id":"Duplicate","href":"Aaaa","name":"Duplicate","disable":true},{"id":"Upload","href":"Aaaa","name":"Upload","disable":true},{"id":"Download","href":"Aaaa","name":"Download","disable":true},{"id":"Search","href":"Aaaa","name":"Search","disable":true},{"id":"Reload","click":"ReloadLeftbar","name":"Reload"}]},{"id":"View","name":"View","children":[{"id":"HindLeftManager","click":"HideLeft","name":"Hind left manager"},{"id":"SplitVertical","href":"Aaaa","name":"Split vertical","disable":true},{"id":"CommandBar","href":"Aaaa","name":"Command bar","disable":true},{"id":"ShareSession","href":"Aaaa","name":"Share session (read/write)","disable":true},{"id":"Language","href":"Aaaa","name":"Language","disable":true}]},{"id":"Help","name":"Help","children":[{"id":"EnterLicense","click":"EnterLicense","name":"Enter License"},{"id":"Website","click":"Website","name":"Website"},{"id":"BBS","click":"BBS","name":"BBS"}]}]', room=sid)
        # print('received json: ' + str(json))
    elif api == 'all':
        socket_io.emit('nav',
             '[{"id":"File","name":"Server","children":[{"id":"NewConnection","href":"Aaaa","name":"New connection","disable":true},{"id":"Connect","href":"Aaaa","name":"Connect","disable":true},{"id":"Disconnect","click":"Disconnect","name":"Disconnect"},{"id":"DisconnectAll","click":"DisconnectAll","name":"Disconnect all"},{"id":"Duplicate","href":"Aaaa","name":"Duplicate","disable":true},{"id":"Upload","href":"Aaaa","name":"Upload","disable":true},{"id":"Download","href":"Aaaa","name":"Download","disable":true},{"id":"Search","href":"Aaaa","name":"Search","disable":true},{"id":"Reload","click":"ReloadLeftbar","name":"Reload"}]},{"id":"View","name":"View","children":[{"id":"HindLeftManager","click":"HideLeft","name":"Hind left manager"},{"id":"SplitVertical","href":"Aaaa","name":"Split vertical","disable":true},{"id":"CommandBar","href":"Aaaa","name":"Command bar","disable":true},{"id":"ShareSession","href":"Aaaa","name":"Share session (read/write)","disable":true},{"id":"Language","href":"Aaaa","name":"Language","disable":true}]},{"id":"Help","name":"Help","children":[{"id":"EnterLicense","click":"EnterLicense","name":"Enter License"},{"id":"Website","click":"Website","name":"Website"},{"id":"BBS","click":"BBS","name":"BBS"}]}]', room=sid)


@socket_io.on('connect', namespace='/')
def handle_term_connect(sid, environ):
    clients[sid] = collections.defaultdict(dict)


@socket_io.on('machine')
def handle_machine(sid, message):
    clients[sid]['host'] = host = '192.168.152.129'
    clients[sid]['port'] = port = 22
    # t = threading.Thread(target=forward, args=(sid,))
    # t.setDaemon(True)
    # t.start()
    global thread
    if thread is None:
        thread = socket_io.start_background_task(forward, sid)
    socket_io.emit('data', 'Connect to %s:%s' % (host, port), room=sid)


@socket_io.on('data')
def handle_data(sid, message):
    print('Receive data: %s' % message)
    if clients[sid]['chan']:
        clients[sid]['chan'].send(message)


@socket_io.on('disconnect')
def handle_term_disconnect(sid):
    del clients[sid]
    print('term disconnect')


@socket_io.on('resize')
def handle_term_resize(sid, json):
    print('term resize: ' + str(json))
    pass


def forward(sid):
    try:
        host = clients[sid]['host']
        port = clients[sid]['port']
    except KeyError as e:
        socket_io.emit('data', e, room=sid)
        return

    for i in range(1, 10):
        socket_io.emit('data', 'Forwarding\r\n')
        socket_io.emit('data', 'Forwarding\r\n')
        socket_io.sleep(1)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username='root', password='redhat')
    clients[sid]['ssh'] = ssh
    clients[sid]['chan'] = chan = ssh.invoke_shell()
    while True:
        r, w, x = select.select([chan], [], [])
        if chan in r:
            data = chan.recv(1024)
            if not len(data):
                break
            print('Sending data: %s' % data)
            socket_io.emit('data', 'What is')
