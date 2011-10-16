mongo = require 'mongoskin'
db = mongo.db 'localhost:27017/supersonic?auto_reconnect'
db.createCollection 'loginToken', (err, replies) ->
db.createCollection 'user', (err, replies) ->
    console.log 'replies', replies
    console.log 'err', err
    db.collection('user').ensureIndex [['username', 1]], true, (err, replies) ->
        console.log 'replies',replies
        console.log 'err', err
        process.exit 0
