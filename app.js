(function() {
  var Server, app, configArgs, db, express, form, mongo, mongoStore, router, server_config, sys;
  configArgs = require('./config.coffee').config;
  express = require('express');
  form = require('connect-form');
  router = require('./router.coffee');
  mongo = require('mongoskin');
  mongoStore = require('connect-mongodb');
  Server = require('mongodb').Server;
  app = module.exports = express.createServer();
  sys = require('sys');
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
    return app.use(express.static(__dirname + '/public'));
  });
  app.configure('development', function() {
    return app.use(express.errorHandler({
      dumpExceptions: true,
      showStack: true
    }));
  });
  app.configure('production', function() {
    var NotFound;
    NotFound = (function() {
      function NotFound(msg) {
        this.name = 'NotFound';
        Error.call(this, msg);
        Error.captureStacktrace(this, arguments.callee);
      }
      return NotFound;
    })();
    sys.inherits(NotFound, Error);
    app.error(function(err, req, res, next) {
      console.log('err', err);
      if (err instanceof NotFound) {
        return res.render('404.jade', {
          status: 404,
          title: '404'
        });
      } else {
        return next(err);
      }
    });
    return app.error(function(err, req, res) {
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
  db.bind('feed');
  db.user.ensureIndex({
    'username': 1
  }, true, function(err) {
    return console.log('index err', err);
  });
  router.route(app);
  app.listen(configArgs.port);
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
}).call(this);
