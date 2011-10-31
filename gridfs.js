(function() {
  var Db, GridFS, GridStore, Server, configArgs, db, server_config;
  configArgs = require('./config.js').config;
  GridStore = require('mongodb').GridStore;
  Db = require('mongodb').Db;
  Server = require('mongodb').Server;
  server_config = new Server(configArgs.mongo.host, configArgs.mongo.port, {
    auto_reconnect: true
  });
  db = new Db(configArgs.mongo.dbname, server_config);
  db.open(function(err, db) {
    return console.log("%s grid fs is open", root);
  });
  GridFS = (function() {
    function GridFS(options) {
      this.options = options;
    }
    GridFS.prototype.writeFile = function(filename, path, cb) {
      var gridStore, _options;
      _options = this.options;
      gridStore = new GridStore(db, filename, "w", _options);
      return gridStore.open(function(err, gridStore) {
        return gridStore.writeFile(path, function(err, result) {
          return gridStore.close(function(err, result) {
            return cb(err, result);
          });
        });
      });
    };
    GridFS.prototype.write = function(filename, content, cb) {
      var gridStore, _options;
      _options = this.options;
      gridStore = new GridStore(db, filename, "w", _options);
      return gridStore.open(function(err, gridStore) {
        return gridStore.write(content, function(err, gridStore) {
          return gridStore.close(function(err, result) {
            return cb(err);
          });
        });
      });
    };
    GridFS.prototype.unlink = function(filename, cb) {
      var _options;
      _options = this.options;
      return GridStore.unlink(db, filename, _options, function(err, content) {
        return cb(err);
      });
    };
    GridFS.prototype.stream = function(filename, cb) {
      var gridStore, _options;
      _options = this.options;
      gridStore = new GridStore(db, filename, "r", _options);
      return gridStore.open(function(err, gridStore) {
        var fileStream;
        fileStream = gridStore.stream(true);
        fileStream.on('error', function(error) {
          return console.log('error', error);
        });
        fileStream.on('end', function(end) {
          return console.log('end');
        });
        return cb(err, fileStream);
      });
    };
    GridFS.prototype.exist = function(filename, cb) {
      var _options;
      _options = this.options;
      return GridStore.exist(db, filename, _options.root, function(err, exist) {
        return cb(err, exist);
      });
    };
    return GridFS;
  })();
  exports.GridFS = GridFS;
}).call(this);
