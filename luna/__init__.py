# ~*~ coding: utf-8 ~*~
#

import os
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

from .app import app, socket_io
from . import authentication, views
import logger

from flask import request
