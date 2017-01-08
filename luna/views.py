#!/usr/bin/env python
# coding: utf-8


from flask import render_template, send_from_directory, jsonify, g
from flask_socketio import emit

from . import app, socket_io


@app.route('/api/token')
def get_token():
    if g.current_user is None:
        return jsonify({'Error': 'Auth failed or use old token'})
    else:
        g.token = g.current_user.token
        return jsonify({'token': g.current_user.token})


@app.route('/api/asset/list')
def get_asset_list():
    asset_list = api.get_user_assets_granted(g.current_user)
    return jsonify(asset_list)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/get_site')
def get_site():
    print(app.config.get('JUMPSERVER_URL'))
    return jsonify({"hello": "world"})


@app.route('/bifrost/')
def bifrost():
    return render_template('index.html')


@app.route('/bifrost/<path:path>')
def send_dist(path):
    return send_from_directory('dist', path)


@socket_io.on('data')
def handle_data(message):
    print('received data: ' + message)
    emit('data', message)


@socket_io.on('machine')
def handle_machine(message):
    print('received machine: ' + message)


@socket_io.on('api')
def handle_api(api):
    if api == 'nav':
        emit('nav',
             '[{"id":"File","name":"Server","children":[{"id":"NewConnection","href":"Aaaa","name":"New connection","disable":true},{"id":"Connect","href":"Aaaa","name":"Connect","disable":true},{"id":"Disconnect","click":"Disconnect","name":"Disconnect"},{"id":"DisconnectAll","click":"DisconnectAll","name":"Disconnect all"},{"id":"Duplicate","href":"Aaaa","name":"Duplicate","disable":true},{"id":"Upload","href":"Aaaa","name":"Upload","disable":true},{"id":"Download","href":"Aaaa","name":"Download","disable":true},{"id":"Search","href":"Aaaa","name":"Search","disable":true},{"id":"Reload","click":"ReloadLeftbar","name":"Reload"}]},{"id":"View","name":"View","children":[{"id":"HindLeftManager","click":"HideLeft","name":"Hind left manager"},{"id":"SplitVertical","href":"Aaaa","name":"Split vertical","disable":true},{"id":"CommandBar","href":"Aaaa","name":"Command bar","disable":true},{"id":"ShareSession","href":"Aaaa","name":"Share session (read/write)","disable":true},{"id":"Language","href":"Aaaa","name":"Language","disable":true}]},{"id":"Help","name":"Help","children":[{"id":"EnterLicense","click":"EnterLicense","name":"Enter License"},{"id":"Website","click":"Website","name":"Website"},{"id":"BBS","click":"BBS","name":"BBS"}]}]')
        # print('received json: ' + str(json))
    elif api == 'all':
        emit('nav',
             '[{"id":"File","name":"Server","children":[{"id":"NewConnection","href":"Aaaa","name":"New connection","disable":true},{"id":"Connect","href":"Aaaa","name":"Connect","disable":true},{"id":"Disconnect","click":"Disconnect","name":"Disconnect"},{"id":"DisconnectAll","click":"DisconnectAll","name":"Disconnect all"},{"id":"Duplicate","href":"Aaaa","name":"Duplicate","disable":true},{"id":"Upload","href":"Aaaa","name":"Upload","disable":true},{"id":"Download","href":"Aaaa","name":"Download","disable":true},{"id":"Search","href":"Aaaa","name":"Search","disable":true},{"id":"Reload","click":"ReloadLeftbar","name":"Reload"}]},{"id":"View","name":"View","children":[{"id":"HindLeftManager","click":"HideLeft","name":"Hind left manager"},{"id":"SplitVertical","href":"Aaaa","name":"Split vertical","disable":true},{"id":"CommandBar","href":"Aaaa","name":"Command bar","disable":true},{"id":"ShareSession","href":"Aaaa","name":"Share session (read/write)","disable":true},{"id":"Language","href":"Aaaa","name":"Language","disable":true}]},{"id":"Help","name":"Help","children":[{"id":"EnterLicense","click":"EnterLicense","name":"Enter License"},{"id":"Website","click":"Website","name":"Website"},{"id":"BBS","click":"BBS","name":"BBS"}]}]')


@socket_io.on('connect')
def handle_term_connect():
    print('term connect')


@socket_io.on('disconnect')
def handle_term_disconnect():
    print('term disconnect')


@socket_io.on('resize')
def handle_term_resize(json):
    print('term resize: ' + str(json))
    pass

