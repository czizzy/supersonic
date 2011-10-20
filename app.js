(function() {
  var Server, api, app, configArgs, db, express, form, mongo, mongoStore, router, server_config, sys;
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
  app.helpers(require('./helpers.js').helpers);
  app.dynamicHelpers(require('./helpers.js').dynamicHelpers);
  if (configArgs.mongo.account) {
    app.db = db = configArgs.mongo.account + ':' + configArgs.mongo.password + '@' + mongo.db(configArgs.mongo.host + ':' + configArgs.mongo.port + '/' + configArgs.mongo.dbname + '?auto_reconnect');
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
        dbname: configArgs.mongo.dbname
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
  app.configure('development', function() {
    return app.use(express.errorHandler({
      dumpExceptions: true,
      showStack: true
    }));
  });
  app.configure('production', function() {});
  db.bind('user');
  db.bind('loginToken');
  db.bind('post');
  db.bind('comment');
  db.user.ensureIndex({
    'username': 1
  }, true, function(err) {
    return console.log('index err', err);
  });
  db.comment.ensureIndex({
    'p_id': 1
  }, false, function(err) {
    return console.log('index err', err);
  });
  db.post.ensureIndex({
    'u_id': 1
  }, false, function(err) {
    return console.log('index err', err);
  });
  router.route(app);
  api.start(app);
  app.listen(configArgs.port);
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
}).call(this);
