#!/usr/bin/env python
# ~*~ coding: utf-8 ~*~
# 

from flask import g, request, redirect
from functools import wraps, partial

from jms import UserService
from . import app


def login_required(func=None, login_url=None):
    if func is None:
        return partial(login_required, login_url=login_url)

    @wraps(func)
    def wrapper(*args, **kwargs):
        url = login_url
        if url is None:
            endpoint = app.config['JUMPSERVER_ENDPOINT']
            url = endpoint.rstrip('/') + '/users/login?next=' + request.url
        session_id = request.cookies.get('sessionid', '')
        csrf_token = request.cookies.get('csrftoken', '')

        if '' in [session_id, csrf_token]:
            return redirect(url)

        g.user_service = UserService(endpoint=app.config['JUMPSERVER_ENDPOINT'])
        g.user_service.auth_from_session(session_id, csrf_token)
        user = g.user_service.is_authenticated()
        if user:
            g.user = user
            return func(*args, **kwargs)
        else:
            return redirect(login_url)
    return wrapper




