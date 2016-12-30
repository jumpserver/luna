import sys
import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(BASE_DIR))
sys.path.append(os.path.dirname(BASE_DIR))
sys.path.append(PROJECT_DIR)

# Use main config except define by self
from config import config as main_config, WebTerminalConfig
CONFIG = main_config.get('web_terminal', WebTerminalConfig)
