(function() {
  var db, mongo;
  mongo = require('mongoskin');
  db = mongo.db('localhost:27017/supersonic?auto_reconnect');
  db.createCollection('loginToken', function(err, replies) {});
  db.createCollection('user', function(err, replies) {
    console.log('replies', replies);
    console.log('err', err);
    return db.collection('user').ensureIndex([['username', 1]], true, function(err, replies) {
      console.log('replies', replies);
      console.log('err', err);
      return process.exit(0);
    });
  });
}).call(this);
