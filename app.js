/**
 * Created by liuzheng on 7/17/16.
 */
var server = {};

var http = require('http');
var express = require('express');
var io = require('socket.io');
// var pty = require('pty.js');
// var terminal = require('term.js');

var socket;
var term;
var buff = [];

server.run = function (options) {

  var app = express();
  var server = http.createServer(app);
  var apis = express.Router();

  app.use("/", express.static(__dirname + '/dist/')); // 创建服务端
  // app.use("/socket.io/", express.static(__dirname + '/api/')); // 创建服务端
  // let term.js handle req/res
  // app.use(terminal.middleware());

  apis.route('/browser')
    .post(function (req, res) {
      console.log(req);
      res.string('');
      // res.json({verified: true, csrf: "liuzheng"})
    });
  apis.route('/checklogin')
    .post(function (req, res) {
      res.json({logined: true, id: 1, username: "liuzheng", name: "liuzheng"})
    })
    .get(function (req, res) {
      res.json({logined: true})
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
