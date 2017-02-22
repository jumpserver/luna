# ~*~ coding: utf-8 ~*~
#!/usr/bin/env python
# -*- coding: utf-8 -*-
#

import os
import sys
from six import string_types
from werkzeug.utils import import_string

# from . import PROJECT_DIR
PROJECT_DIR = os.path.dirname(os.path.dirname(__file__))
sys.path.append(PROJECT_DIR)

try:
    import config as custom_config
except ImportError:
    custom_config = object()


class ConfigAttribute(object):
    """Makes an attribute forward to the config"""

    def __init__(self, name, get_converter=None):
        self.__name__ = name
        self.get_converter = get_converter

    def __get__(self, obj, type=None):
        if obj is None:
            return self
        rv = obj.config[self.__name__]
        if self.get_converter is not None:
            rv = self.get_converter(rv)
        return rv

    def __set__(self, obj, value):
        obj.config[self.__name__] = value


class Config(dict):
    """使用该类作为配置类, 方便设置值和属性, 使用默认值, 本类精简与flask.config
    See: https://github.com/pallets/flask/blob/master/flask/settings.py

        defaults_config = {
            "NAME": "luna",
        }

        config = Config(defaults=defaults_config)
        config['HOST'] = '0.0.0.0'
        config.NAME  属性访问
           或使用小写key作为变量
        config.name

    """

    default_config = {
        'NAME': 'luna',
        'BIND_HOST': '0.0.0.0',
        'LISTEN_PORT': 5000,
        'JUMPSERVER_ENDPOINT': 'http://localhost:8080',
        'DEBUG': True,
        'SECRET_KEY': '2vym+ky!997d5kkcc64mnz06y1mmui3lut#(^wd=%s_qj$1%x',
        'ACCESS_KEY': None,
        'ACCESS_KEY_ENV': 'COCO_ACCESS_KEY',
        'ACCESS_KEY_STORE': os.path.join(PROJECT_DIR, 'keys', '.access_key'),
        'LOG_LEVEL': 'DEBUG',
        'LOG_DIR': os.path.join(PROJECT_DIR, 'logs'),
        'ASSET_LIST_SORT_BY': 'ip',
        'SSH_PASSWORD_AUTH': True,
        'SSH_PUBLIC_KEY_AUTH': True,
        'HEATBEAT_INTERVAL': 5,
        'BROKER_URL': 'redis://localhost:6379',
        'CELERY_RESULT_BACKEND': 'redis://localhost:6379',
        # 'CELERY_ACCEPT_CONTENT': ['json']
    }

    def __init__(self, defaults=default_config):
        super(Config, self).__init__(defaults or {})

    def from_object(self, obj):
        """从object对象获取配置, 或者导入一个配置模块

            from local_config import Config
            config.from_object(Config)
               或从配置模块导入
            config.from_object('some_settings')

        """
        if isinstance(obj, string_types):
            obj = import_string(obj)
        for key in dir(obj):
            if key.isupper():
                self[key] = getattr(obj, key)

    def __getattr__(self, item):
        try:
            return self.__getitem__(item)
        except KeyError:
            return self.__getitem__(item.upper())


config = Config()
config.from_object(custom_config)



