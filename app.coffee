##
 # Module dependencies.
 #

configArgs = require('./config.js').config
express = require 'express'
form = require 'connect-form'
router = require './router.js'
mongo = require 'mongoskin'
mongoStore = require 'connect-mongodb'
Server = require('mongodb').Server
app = module.exports = express.createServer()
sys = require 'sys'
api = require './api.js'
app.helpers require('./helpers.js').helpers
app.dynamicHelpers require('./helpers.js').dynamicHelpers;
app.settings.env = configArgs.env
if(configArgs.mongo.account)
    app.db = db = mongo.db configArgs.mongo.account + ':' + configArgs.mongo.password + '@' + configArgs.mongo.host + ':' + configArgs.mongo.port + '/' + configArgs.mongo.dbname + '?auto_reconnect'
else
    app.db = db = mongo.db configArgs.mongo.host + ':' + configArgs.mongo.port + '/' + configArgs.mongo.dbname + '?auto_reconnect'

server_config = new Server configArgs.mongo.host, configArgs.mongo.port, {auto_reconnect: true}

# Configuration

app.configure () ->
    app.set('views', __dirname + '/views')
    app.set('view engine', 'jade')
    app.use express.bodyParser()
    app.use express.cookieParser()
    app.use form({keepExtensions: true})
    app.use express.session {store: new mongoStore({server_config: server_config, repeatInterval: 3000, dbname:configArgs.mongo.dbname, username:configArgs.mongo.account, password:configArgs.mongo.password}), secret: 'supersonic'}
    #app.use express.session {store: new mongoStore({db:db.db, repeatInterval: 3000}), secret: 'supersonic'}
    app.use(express.methodOverride())
    app.use(app.router)
    app.use(express.static(__dirname + '/public'))
    # error handling


app.configure 'development', () ->
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }))


app.configure 'production', () ->
    app.use (err, req, res, next) ->
        console.log 'handle err', err
        res.render '500.jade'
            status:500,
            locals: { title:'500', error: err}


db.bind 'user'
db.bind 'loginToken'
db.bind 'post'
db.bind 'comment'

db.user.ensureIndex {'username':1}, true, (err)->
    console.log 'index err', err
db.comment.ensureIndex {'p_id':1}, false, (err)->
    console.log 'index err', err
db.post.dropIndex {'u_id':1}, false, (err)->
    console.log 'drop err', err
db.post.ensureIndex {date:-1, u_id:1}, false, (err)->
    console.log 'index err', err

# Routes
router.route app

# api
api.start app

app.listen(configArgs.port)
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env)
