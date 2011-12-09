(function() {
  var listen, parseCookie;
  parseCookie = require('connect').utils.parseCookie;
  listen = function(app) {
    var db, io;
    db = app.db;
    io = app.io;
    io.configure(function() {
      return io.set('authorization', function(handshakeData, callback) {
        var cookie;
        cookie = parseCookie(handshakeData.headers.cookie);
        return app.sessionStore.get(cookie['connect.sid'], function(err, session) {
          if (err || !session) {
            return callback(null, false);
          } else {
            handshakeData.user_id = session.user_id;
            return callback(null, true);
          }
        });
      });
    });
    io.sockets.on('error', function(reason) {
      return console.log('socket.io error:', reason);
    });
    return io.sockets.on('connection', function(socket) {
      app.clients[socket.handshake.user_id] = socket.id;
      return socket.on('disconnect', function(a) {
        delete app.clients[socket.handshake.user_id];
        console.log('clients', app.clients);
        return console.log('disconnect', a);
      });
    });
  };
  exports.listen = listen;
}).call(this);
