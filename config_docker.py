# ~*~ coding: utf-8 ~*~

import os

DEBUG = True
# NAME = 'luna'
# BIND_HOST = '0.0.0.0'
# LISTEN_PORT = 5000
JUMPSERVER_ENDPOINT = os.environ.get("JUMPSERVER_ENDPOINT") or 'http://jumpserver:8080/'
# ACCESS_KEY = None
# ACCESS_KEY_ENV = 'LUNA_ACCESS_KEY'
# ACCESS_KEY_STORE = os.path.join(BASE_DIR, 'luna', 'keys', '.access_key')
# LOG_DIR = os.path.join(BASE_DIR, 'luna', 'logs')
# LOG_LEVEL = 'DEBUG'
# ASSET_LIST_SORT_BY = 'ip'
# HEATBEAT_INTERVAL = 5
