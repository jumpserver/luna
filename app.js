/**
 * Created by liuzheng on 7/17/16.
 */
var server = {};

var http = require('http');
var express = require('express');
var io = require('socket.io');
var pty = require('pty.js');
// var terminal = require('term.js');

var socket;
var term;
var buff = [];

server.run = function (options) {

  // create shell process
  term = pty.fork(
    process.env.SHELL || 'sh',
    [],
    {
      name: require('fs').existsSync('/usr/share/terminfo/x/xterm-256color')
        ? 'xterm-256color'
        : 'xterm',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME
    }
  );
  //
  // // store term's output into buffer or emit through socket
  term.on('data', function (data) {
    return !socket ? buff.push(data) : socket.emit('data', data);
  });

  // console.log('Created shell with pty master/slave pair (master: %d, pid: %d)', term.fd, term.pid);

  var app = express();
  var server = http.createServer(app);
  var apis = express.Router();

  app.use("/", express.static(__dirname + '/dist/')); // 创建服务端
  // app.use("/socket.io/", express.static(__dirname + '/api/')); // 创建服务端
  // let term.js handle req/res
  // app.use(terminal.middleware());

  apis.route('/browser')
    .post(function (req, res) {
      // console.log(req);
      // res.string('');
      res.json({verified: true, csrf: "liuzheng"})
    });
  apis.route('/checklogin')
    .post(function (req, res) {
      res.json({logined: true, id: 1, username: "liuzheng", name: "liuzheng"})
    })
    .get(function (req, res) {
      res.json({logined: true})
    });
  apis.route('/nav')
    .get(function (req, res) {
      res.json([{
        "id": "File",
        "name": "Server",
        "children": [
          {
            "id": "NewConnection",
            "href": "Aaaa",
            "name": "New connection",
            "disable": true
          },
          {
            "id": "Connect",
            "href": "Aaaa",
            "name": "Connect",
            "disable": true
          },
          {
            "id": "Disconnect",
            "click": "Disconnect",
            "name": "Disconnect"
          },
          {
            "id": "DisconnectAll",
            "click": "DisconnectAll",
            "name": "Disconnect all"
          },
          {
            "id": "Duplicate",
            "href": "Aaaa",
            "name": "Duplicate",
            "disable": true
          },
          {
            "id": "Upload",
            "href": "Aaaa",
            "name": "Upload",
            "disable": true
          },
          {
            "id": "Download",
            "href": "Aaaa",
            "name": "Download",
            "disable": true
          },
          {
            "id": " Search",
            "href": "Aaaa",
            "name": "Search",
            "disable": true
          },
          {
            "id": "Reload",
            "click": "ReloadLeftbar",
            "name": "Reload"
          }
        ]
      }, {
        "id": "View",
        "name": "View",
        "children": [
          {
            "id": "HindLeftManager",
            "click": "HideLeft",
            "name": "Hind left manager"
          },
          {
            "id": "SplitVertical",
            "href": "Aaaa",
            "name": "Split vertical",
            "disable": true
          },
          {
            "id": "CommandBar",
            "href": "Aaaa",
            "name": "Command bar",
            "disable": true
          },
          {
            "id": "ShareSession",
            "href": "Aaaa",
            "name": "Share session (read/write)",
            "disable": true
          },
          {
            "id": "Language",
            "href": "Aaaa",
            "name": "Language",
            "disable": true
          }]
      }, {
        "id": "Help",
        "name": "Help",
        "children": [
          {
            "id": "EnterLicense",
            "click": "EnterLicense",
            "name": "Enter License"
          },
          {
            "id": "Website",
            "click": "Website",
            "name": "Website"
          },
          {
            "id": "BBS",
            "click": "BBS",
            "name": "BBS"
          }]
      }])
    });

  app.use("/api", apis);
  // let server listen on the port
  options = options || {};
  server.listen(options.port || 3000);

  // let socket.io handle sockets
  io = io.listen(server, {log: false});

  io.sockets.on('connection', function (s) {
    // when connect, store the socket
    socket = s;

    // handme incoming data (client -> server)
    socket.on('data', function (data) {
      term.write(data);
    });

    socket.on('resize', function (data) {
      term.resize(data[0], data[1]);
      console.log(data)
    });
    // handle connection lost
    socket.on('disconnect', function () {
      socket = null;
    });

    // send buffer data to client
    while (buff.length) {
      socket.emit('data', buff.shift());
    }
  });
};


server.run({port: 3000});

console.log('Please open your browser with http://127.0.0.1:3000');
