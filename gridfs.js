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
    function GridFS(root) {
      this.root = root;
    }
    GridFS.prototype.writeFile = function(filename, path, cb) {
      var gridStore, _root;
      _root = this.root;
      gridStore = new GridStore(db, filename, "w", {
        'root': _root
      });
      return gridStore.open(function(err, gridStore) {
        console.log('open err', err);
        return gridStore.writeFile(path, function(err, result) {
          console.log('result err', err);
          console.log(result, 'result');
          return gridStore.close(function(err, result) {
            return cb(err, result);
          });
        });
      });
    };
    GridFS.prototype.unlink = function(filename, cb) {
      var _root;
      _root = this.root;
      return GridStore.unlink(db, filename, {
        'root': _root
      }, function(err, content) {
        return cb(err);
      });
    };
    GridFS.prototype.stream = function(filename, cb) {
      var gridStore, _root;
      _root = this.root;
      console.log(filename);
      gridStore = new GridStore(db, filename, "r", {
        'root': _root
      });
      console.log(gridStore);
      return gridStore.open(function(err, gridStore) {
        var fileStream;
        console.log('open', filename);
        console.log('err', err);
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
      var _root;
      _root = this.root;
      return GridStore.exist(db, filename, _root, function(err, exist) {
        return cb(err, exist);
      });
    };
    return GridFS;
  })();
  exports.GridFS = GridFS;
}).call(this);
