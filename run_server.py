#!/usr/bin/env python
# ~*~ coding: utf-8 ~*~

from luna import app
from config import Config

app.config.from_object(Config)

if __name__ == '__main__':
    app.run(host=app.config['BIND_HOST'], port=app.config['LISTEN_PORT'],
            debug=app.config['DEBUG'])
