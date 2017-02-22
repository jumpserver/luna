#!/usr/bin/env python
# ~*~ coding: utf-8 ~*~
# 

from flask import g, request, redirect
from functools import wraps, partial

from jms import UserService
from . import app


def is_authenticate():
    pass


def login_required(login_url=None):
    if login_url is None:
        endpoint = app.config['JUMPSERVER_ENDPOINT']
        login_url = endpoint.rstrip('/') + '/users/login?next=' + request.url
        return partial(login_required, login_url=login_url)

    def decorate(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            session_id = request.cookies.get('sessionid', '')
            csrf_token = request.cookies.get('csrf_token', '')
            if '' in [session_id, csrf_token]:
                return redirect(login_url)

            g.user_service = UserService.auth_from_session(session_id, csrf_token)
            if g.user_service.is_authenticate():
                return func(*args, **kwargs)
            else:
                return redirect(login_url)
        return wrapper
    return decorate




