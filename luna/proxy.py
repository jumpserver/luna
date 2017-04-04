# ~*~ coding: utf-8 ~*~

import re
import logging
import time
import socket
import select
import threading

import paramiko

from jms.utils import wrap_with_line_feed as wr, wrap_with_warning as warning
from jms.utils import TtyIOParser
# from .globals import request, g
from .tasks import command_queue, record_queue
from .app import app

logger = app.logger


class ProxyServer(object):
    """
    We are using this class proxy client channel (user) with backend channel

    When receive client input command, send to backend ssh channel
    and when receive output of command from backend, send to client

    We also record the command and result to database for audit

    """
    ENTER_CHAR = ['\r', '\n', '\r\n']
    OUTPUT_END_PATTERN = re.compile(r'\x1b]0;.+@.+:.+\x07.*')
    VIM_PATTERN = re.compile(r'\x1b\[\?1049', re.X)
    IGNORE_OUTPUT_COMMAND = [re.compile(r'^cat\s+'),
                             re.compile(r'^tailf?\s+')]

    def __init__(self, app, user, asset, system_user, client_channel, stop_event):
        self.app = app
        self.user = user
        self.asset = asset
        self.system_user = system_user
        self.service = app.service
        self.client_channel = client_channel
        self.change_win_size_event = threading.Event()
        self.stop_event = stop_event

        self.input = ''
        self.output = ''
        self.output_data = []
        self.input_data = []
        self.history = {}
        self.in_vim_state = False
        # This ssh session command serial no
        self.command_no = 1
        # If is first input, will clear the output data: ssh banner and PS1
        self.is_first_input = True
        self.in_input_state = False
        self.ssh = None
        self.backend_channel = None
        self.proxy_log_id = 0

    def is_finish_input(self, s):
        for char in s:
            if char in self.ENTER_CHAR:
                return True
        return False

    def get_output(self):
        width = self.client_channel.win_width
        height = self.client_channel.win_height
        parser = TtyIOParser(width=width, height=height)
        self.output = parser.parse_output(b''.join(self.output_data))
        if self.input:
            data = {
                'proxy_log_id': self.proxy_log_id,
                'user': self.user.username,
                'asset': self.asset.ip,
                'system_user': self.system_user.username,
                'command_no': self.command_no,
                'command': self.input,
                'output': self.output[:100],
                'timestamp': time.time(),
            }
            command_queue.put(data)
            self.command_no += 1

    def get_input(self):
        width = self.client_channel.win_width
        height = self.client_channel.win_height
        parser = TtyIOParser(width=width, height=height)
        self.input = parser.parse_input(b''.join(self.input_data))

    def validate_user_asset_permission(self):
        return self.service.validate_user_asset_permission(
            self.user.id, self.asset.id, self.system_user.id)

    def get_asset_auth(self, system_user):
        return self.service.get_system_user_auth_info(system_user)

    def connect(self, term=b'xterm', width=80, height=24, timeout=10):
        user = self.user
        asset = self.asset
        system_user = self.system_user
        client_channel = self.client_channel
        try:
            width = int(client_channel.win_width)
            height = int(client_channel.win_height)
            print('term %s*%s' % (width, height))
        except TypeError:
            pass
        if not self.validate_user_asset_permission():
            logger.warning('User %s have no permission connect %s with %s' %
                           (user.username, asset.ip, system_user.username))
            return None
        self.ssh = ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        password, private_key = self.get_asset_auth(system_user)

        data = {"user": user.username, "asset": asset.ip,
                "system_user": system_user.username,  "login_type": "WT",
                "date_start": time.time(), "is_failed": 0}
        self.proxy_log_id = proxy_log_id = self.service.send_proxy_log(data)
        self.app.proxy_list[proxy_log_id] = self.client_channel, self.backend_channel
        try:
            client_channel.send(
                wr('Connecting %s@%s:%s ... ' %
                   (system_user.username, asset.ip, asset.port)))
            ssh.connect(hostname=asset.ip, port=asset.port,
                        username=system_user.username,
                        password=password, pkey=private_key,
                        look_for_keys=False, allow_agent=True,
                        compress=True, timeout=timeout)

        except (paramiko.AuthenticationException,
                paramiko.ssh_exception.SSHException):
            msg = 'Connect backend server %s failed: %s' \
                  % (asset.ip, 'Auth failed')
            logger.warning(msg)
            failed = True

        except socket.error:
            msg = 'Connect asset %s failed: %s' % (asset.ip, 'Timeout')
            logger.warning(msg)
            failed = True
        else:
            msg = 'Connect asset %(username)s@%(host)s:%(port)s successfully' % {
                       'username': system_user.username,
                       'host': asset.ip,
                       'port': asset.port}
            failed = False
            logger.info(msg)

        if failed:
            client_channel.send(wr(warning(msg+'\r\n')))
            data = {
                "proxy_log_id": proxy_log_id,
                "date_finished": time.time(),
                "was_failed": 1
            }
            self.service.finish_proxy_log(data)
            return None

        self.backend_channel = channel = ssh.invoke_shell(
            term=term, width=width, height=height)
        channel.settimeout(100)
        return channel

    def is_match_ignore_command(self, data):
        for pattern in self.IGNORE_OUTPUT_COMMAND:
            if pattern.match(data):
                return True
        return False

    def proxy(self):
        self.backend_channel = backend_channel = self.connect()
        client_channel = self.client_channel

        if backend_channel is None:
            return

        self.app.proxy_list[self.proxy_log_id] = \
            [self.client_channel, backend_channel]

        while not self.stop_event.set():
            r, w, x = select.select([client_channel, backend_channel], [], [])

            #if self.change_win_size_event.is_set():
            #    self.change_win_size_event.clear()
            #    width = self.client_channel.win_width
            #    height = self.client_channel.win_height
            #    backend_channel.resize_pty(width=width, height=height)

            if client_channel in r:
                # Get output of the command
                self.is_first_input = False
                if self.in_input_state is False:
                    self.get_output()
                    del self.output_data[:]

                self.in_input_state = True
                client_data = client_channel.recv(1024)

                if self.is_finish_input(client_data):
                    self.in_input_state = False
                    self.get_input()
                    del self.input_data[:]

                if len(client_data) == 0:
                    break
                backend_channel.send(client_data)

            if backend_channel in r:
                backend_data = backend_channel.recv(1024)
                if self.in_input_state:
                    self.input_data.append(backend_data)
                else:
                    self.output_data.append(backend_data)

                if len(backend_data) == 0:
                    client_channel.send(
                        wr('Disconnect from %s' % self.asset.ip))
                    logger.info('Logout from asset %(host)s: %(username)s' % {
                        'host': self.asset.ip,
                        'username': self.user.username,
                    })
                    break

                client_channel.send(backend_data)
                # Todo: record log send
                # if self.is_match_ignore_command(self.input):
                #     output = 'ignore output ...'
                # else:
                #     output = backend_data
                # record_data = {
                #     'proxy_log_id': self.proxy_log_id,
                #     'output': output,
                #     'timestamp': time.time(),
                # }
                # record_queue.put(record_data)

        data = {
            "proxy_log_id": self.proxy_log_id,
            "date_finished": time.time(),
        }
        self.service.finish_proxy_log(data)
        del self.app.proxy_list[self.proxy_log_id]

