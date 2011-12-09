##
 # Module dependencies.
 #
configArgs = require('./config.js').config
express = require 'express'
form = require 'connect-form'
mongo = require 'mongoskin'
mongoStore = require 'connect-mongodb'
Server = require('mongodb').Server
app = module.exports = express.createServer()
router = require './router.js'
api = require './api.js'
app.io = require('socket.io').listen app
socketio = require './socketio.js'

sys = require 'sys'

GridFS = require('./gridfs.js').GridFS
app.avatarFS = new GridFS { root:'avatar',"content_type": "image/jpeg", "chunk_size": 1024*64 }
app.audioFS = new GridFS { root:'audio','content_type': 'audio/mp3' }
app.wfFS = new GridFS { root:'waveform','content_type': 'image/png' }

app.helpers require('./helpers.js').helpers
app.dynamicHelpers require('./helpers.js').dynamicHelpers;
app.settings.env = configArgs.env
if(configArgs.mongo.account)
    app.db = db = mongo.db configArgs.mongo.account + ':' + configArgs.mongo.password + '@' + configArgs.mongo.host + ':' + configArgs.mongo.port + '/' + configArgs.mongo.dbname + '?auto_reconnect'
else
    app.db = db = mongo.db configArgs.mongo.host + ':' + configArgs.mongo.port + '/' + configArgs.mongo.dbname + '?auto_reconnect'

server_config = new Server configArgs.mongo.host, configArgs.mongo.port, {auto_reconnect: true}

app.sessionStore = sessionStore = new mongoStore({server_config: server_config, repeatInterval: 3000, dbname:configArgs.mongo.dbname, username:configArgs.mongo.account, password:configArgs.mongo.password})

# Configuration

app.configure () ->
    app.set('views', __dirname + '/views')
    app.set('view engine', 'jade')
    app.use express.bodyParser()
    app.use express.cookieParser()
    app.use form({keepExtensions: true})
    app.use express.session {store: sessionStore, secret: 'supersonic'}
    #app.use express.session {store: new mongoStore({db:db.db, repeatInterval: 3000}), secret: 'supersonic'}
    app.use(express.methodOverride())
    app.use(express.static(__dirname + '/public'))
    app.use(app.router)
    # error handling
    app.use (err, req, res, next) ->
        console.log 'handle err', err
        res.render '500.jade'
            status:500,
            locals: { title:'500', error: err}

db.bind 'user'
db.bind 'loginToken'
db.bind 'post'
db.bind 'comment'
db.bind 'follow'
db.bind 'fav'
db.bind 'notification'

# db.user.ensureIndex {'username':1}, true, (err)->
#     console.log 'user index username', err
# db.comment.ensureIndex {'p':1}, false, (err)->
#     console.log 'comment index p', err
# db.post.ensureIndex {date:-1, u_id:1}, false, (err)->
#     console.log 'post index', err
# db.follow.ensureIndex {from:1, to:1}, true, (err)->
#     console.log 'follow index from'
# db.follow.ensureIndex {to:1}, false, (err)->
#     console.log 'follow index to'
# db.fav.ensureIndex {p:1}, false, (err)->
#     console.log 'fav index'
# db.fav.ensureIndex {u:1, p:1}, true, (err)->
#     console.log 'fav index'

# db.notification.ensureIndex {to:1}, false, (err)->
#     console.log 'notification index'


# socket io
app.clients = {}
socketio.listen app

# Routes
router.route app

# api
api.start app


app.settings.env = configArgs.env
app.listen(configArgs.port)
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env)
