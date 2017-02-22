# ~*~ coding: utf-8 ~*~


from .. import app
from ..authentication import login_required
from flask import render_template, send_from_directory


__all__ = ['index', 'luna', 'send_dist']


@app.route('/')
@login_required
def index():
    return render_template('index.html')


@app.route('/luna/')
def luna():
    return render_template('index.html')


@app.route('/luna/<path:path>')
def send_dist(path):
    return send_from_directory('dist', path)

