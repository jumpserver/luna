# ~*~ coding: utf-8 ~*~


from .. import app
from ..authentication import login_required
from flask import render_template, send_from_directory, make_response


__all__ = ['index', 'luna', 'send_dist']


@app.route('/test/')
@login_required
def test():
    return make_response('Hello')


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

