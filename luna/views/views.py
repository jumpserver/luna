# ~*~ coding: utf-8 ~*~

import os

from . import __version__
from .. import app
from ..authentication import login_required
from flask import render_template, send_from_directory, \
    jsonify, g
import json


API_MOCK_DIR = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'api')
__all__ = ['index', 'luna', 'send_dist']


@app.route('/')
@login_required
def index():
    return render_template('index.html')


@login_required
@app.route('/luna/')
@login_required
def luna():
    return render_template('index.html')


@app.route('/luna/<path:path>')
@login_required
def send_dist(path):
    return send_from_directory('dist', path)


@app.route('/api/version')
def version():
    return jsonify(__version__)


@app.route('/api/nav')
@login_required
def nav():
    with open(os.path.join(API_MOCK_DIR, 'nav')) as f:
        response = json.load(f)
    return jsonify(response)


@app.route('/api/leftbar')
@login_required
def leftbar():
    response = []
    user_service = g.user_service
    asset_groups_assets = user_service.get_my_asset_groups_assets()

    for asset_group in asset_groups_assets:
        asset_group['title'] = asset_group['name']
        asset_group['children'] = asset_group['assets']
        asset_group['folder'] = True
        for asset in asset_group['children']:
            asset['title'] = asset['hostname']
        response.append(asset_group)
    return jsonify(response)


@app.route('/api/search')
def search():
    with open(os.path.join(API_MOCK_DIR, 'search')) as f:
        response = json.load(f)
    return jsonify(response)


@app.route('/api/leftbarrightclick')
def leftbarrightclick():
    with open(os.path.join(API_MOCK_DIR, 'leftbarrightclick')) as f:
        response = json.load(f)
    return jsonify(response)


@app.route('/api/checklogin')
def checklogin():
    return jsonify({
        'logined': True,
        'user': {
            'id': 1,
            'username': 'admin',
            'name': 'Administrator',
            'role': 'Admin',
            'email': 'admin@jumpserver.org',
            'is_active': True,
            'date_joined': '2016-01-01 12:12:12',
            'groups': ['admin', 'sa']
        }
    })


@login_required
@app.route('/api/userprofile')
def profile():
    return jsonify({
        'id': 1,
        'username': 'admin',
        'name': 'Administrator',
        'role': 'Admin',
        'email': 'admin@jumpserver.org',
        'is_active': True,
        'date_joined': '2016-01-01 12:12:12',
        'groups': ['admin', 'sa']
    })




