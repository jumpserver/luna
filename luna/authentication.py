#!/usr/bin/env python
# ~*~ coding: utf-8 ~*~
# 

from flask import g, request
from flask_httpauth import HTTPBasicAuth, HTTPTokenAuth, MultiAuth

from . import app


token_auth = HTTPTokenAuth()
basic_auth = HTTPBasicAuth()
auth = MultiAuth(token_auth, basic_auth)


@basic_auth.verify_password
def verify_password(username, password):
    return True
    user = app.user_service.login(username=username, password=password, remote_addr=request.remote_addr)
    if not user:
        g.current_user = None
        return False
    else:
        g.current_user = user
        return True


@token_auth.verify_token
def verify_token(token):
    return True
    if getattr(g, 'token') and g.token == token:
        return True
    else:
        return False


#@app.before_request
#@auth.login_required
#def before_request():
#    print('Request start')
#    if g.current_user is None:
#        print('User is None')
#        return unauthorized('Invalid credentials')
