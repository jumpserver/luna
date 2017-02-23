# ~*~ coding: utf-8 ~*~
import socket

from .app import socket_io


class ProxyChannel(object):
    def __init__(self, sid):
        self.sid = sid
        self.srv, self.cli = socket.socketpair()
        self.win_width = 80
        self.win_height = 24

    def fileno(self):
        return self.srv.fileno()

    def send(self, s):
        """Proxy server中使用select, 通过socketio发送给用户"""
        return socket_io.emit('data', s, root=self.sid)

    def recv(self, size):
        """Proxy server使用select, 接受socketio客户端数据发送来的数据"""
        return self.srv.recv(size)

    def write(self, s):
        """socket io写数据,proxy可以通过recv收到"""
        print('Client write message: %s' % s)
        self.cli.send(s)

    def set_win_size(self, size):
        self.win_width, self.win_height = size


