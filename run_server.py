#!/usr/bin/env python
# ~*~ coding: utf-8 ~*~


from config import Config
from luna import app, socket_io
# import subprocess

app.config.from_object(Config)
host = app.config['BIND_HOST']
port = app.config['LISTEN_PORT']

if __name__ == '__main__':
    if socket_io.async_mode == 'threading':
        app.run(threaded=True)
    elif socket_io.async_mode == 'eventlet':
        import eventlet
        import eventlet.wsgi
        eventlet.wsgi.server(eventlet.listen(('', 5000)), app)
    else:
        print('Unkonw async_mode: ' + socket_io.async_mode)
