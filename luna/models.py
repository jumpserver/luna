# ~*~ coding: utf-8 ~*~


class User(object):
    def __init__(self, profile):
        for k, v in profile:
            setattr(self, k, v)
        self.sessionid = None
        self.username = profile.get('username', 'Unknown')
        self.name = profile.get('name', 'Unknown')


