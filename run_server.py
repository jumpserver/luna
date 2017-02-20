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
    elif socket_io.async_mode == 'gevent':
        # deploy with gevent
        from gevent import pywsgi

        try:
            from geventwebsocket.handler import WebSocketHandler
            websocket = True
        except ImportError:
            websocket = False
        if websocket:
            pywsgi.WSGIServer(('', 5000), app,
                              handler_class=WebSocketHandler).serve_forever()
        else:
            pywsgi.WSGIServer(('', 5000), app).serve_forever()
    else:
        print('Unkonw async_mode: ' + socket_io.async_mode)
