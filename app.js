(function() {
  var GridFS, Server, api, app, configArgs, db, express, form, mongo, mongoStore, router, server_config, sessionStore, socketio, sys;
  configArgs = require('./config.js').config;
  express = require('express');
  form = require('connect-form');
  mongo = require('mongoskin');
  mongoStore = require('connect-mongodb');
  Server = require('mongodb').Server;
  app = module.exports = express.createServer();
  router = require('./router.js');
  api = require('./api.js');
  app.io = require('socket.io').listen(app);
  socketio = require('./socketio.js');
  sys = require('sys');
  GridFS = require('./gridfs.js').GridFS;
  app.avatarFS = new GridFS({
    root: 'avatar',
    "content_type": "image/jpeg",
    "chunk_size": 1024 * 64
  });
  app.audioFS = new GridFS({
    root: 'audio',
    'content_type': 'audio/mp3'
  });
  app.wfFS = new GridFS({
    root: 'waveform',
    'content_type': 'image/png'
  });
  app.helpers(require('./helpers.js').helpers);
  app.dynamicHelpers(require('./helpers.js').dynamicHelpers);
  app.settings.env = configArgs.env;
  if (configArgs.mongo.account) {
    app.db = db = mongo.db(configArgs.mongo.account + ':' + configArgs.mongo.password + '@' + configArgs.mongo.host + ':' + configArgs.mongo.port + '/' + configArgs.mongo.dbname + '?auto_reconnect');
  } else {
    app.db = db = mongo.db(configArgs.mongo.host + ':' + configArgs.mongo.port + '/' + configArgs.mongo.dbname + '?auto_reconnect');
  }
  server_config = new Server(configArgs.mongo.host, configArgs.mongo.port, {
    auto_reconnect: true
  });
  app.sessionStore = sessionStore = new mongoStore({
    server_config: server_config,
    repeatInterval: 3000,
    dbname: configArgs.mongo.dbname,
    username: configArgs.mongo.account,
    password: configArgs.mongo.password
  });
  app.configure(function() {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.use(form({
      keepExtensions: true
    }));
    app.use(express.session({
      store: sessionStore,
      secret: 'supersonic'
    }));
    app.use(express.methodOverride());
    app.use(express.static(__dirname + '/public'));
    app.use(app.router);
    app.use(express.errorHandler({
      dumpExceptions: true,
      showStack: true
    }));
    return app.use(function(err, req, res, next) {
      console.log('handle err', err);
      return res.render('500.jade', {
        status: 500,
        locals: {
          title: '500',
          error: err
        }
      });
    });
  });
  db.bind('user');
  db.bind('loginToken');
  db.bind('post');
  db.bind('comment');
  db.bind('follow');
  db.bind('fav');
  db.bind('notification');
  app.clients = {};
  socketio.listen(app);
  router.route(app);
  api.start(app);
  app.get('*', function(req, res, next) {
    return res.render('404', {
      title: '404',
      status: 404
    });
  });
  app.settings.env = configArgs.env;
  app.listen(configArgs.port);
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
}).call(this);
