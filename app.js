(function() {
  var GridFS, Server, api, app, configArgs, db, express, form, mongo, mongoStore, router, server_config, sys;
  configArgs = require('./config.js').config;
  express = require('express');
  form = require('connect-form');
  router = require('./router.js');
  mongo = require('mongoskin');
  mongoStore = require('connect-mongodb');
  Server = require('mongodb').Server;
  app = module.exports = express.createServer();
  sys = require('sys');
  api = require('./api.js');
  GridFS = require('./gridfs.js').GridFS;
  app.avatarFS = new GridFS({
    root: 'avatar',
    "content_type": "image/jpeg",
    "chunk_size": 1024 * 64
  });
  app.audioFS = new GridFS({
    root: 'audio',
    "content_type": "audio/mp3"
  });
  app.wfFS = new GridFS({
    root: 'waveform',
    "content_type": "image/png"
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
  app.configure(function() {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.use(form({
      keepExtensions: true
    }));
    app.use(express.session({
      store: new mongoStore({
        server_config: server_config,
        repeatInterval: 3000,
        dbname: configArgs.mongo.dbname,
        username: configArgs.mongo.account,
        password: configArgs.mongo.password
      }),
      secret: 'supersonic'
    }));
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
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
  db.user.ensureIndex({
    'username': 1
  }, true, function(err) {
    return console.log('user index username', err);
  });
  db.comment.ensureIndex({
    'p': 1
  }, false, function(err) {
    return console.log('comment index p', err);
  });
  db.post.ensureIndex({
    date: -1,
    u_id: 1
  }, false, function(err) {
    return console.log('post index', err);
  });
  db.follow.ensureIndex({
    from: 1,
    to: 1
  }, true, function(err) {
    return console.log('follow index from');
  });
  db.follow.ensureIndex({
    to: 1
  }, false, function(err) {
    return console.log('follow index to');
  });
  db.fav.ensureIndex({
    p: 1
  }, false, function(err) {
    return console.log('fav index');
  });
  db.fav.ensureIndex({
    u: 1,
    p: 1
  }, true, function(err) {
    return console.log('fav index');
  });
  router.route(app);
  api.start(app);
  app.listen(configArgs.port);
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
}).call(this);
