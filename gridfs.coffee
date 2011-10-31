configArgs = require('./config.js').config
GridStore = require('mongodb').GridStore
Db = require('mongodb').Db
Server = require('mongodb').Server
server_config = new Server configArgs.mongo.host, configArgs.mongo.port, {auto_reconnect: true}
db = new Db configArgs.mongo.dbname, server_config
db.open (err, db) ->
    console.log "%s grid fs is open", root

class GridFS
    constructor:(options) ->
        @options = options

    writeFile: (filename, path, cb) ->
        _options = @options
        #db.authenticate configArgs.mongo.account, configArgs.mongo.password, (err, success) ->
        gridStore = new GridStore db, filename, "w", _options
        gridStore.open (err, gridStore) ->
            gridStore.writeFile path, (err, result) ->
                gridStore.close (err, result) ->
                    cb(err, result)
    write: (filename, content, cb) ->
        _options = @options
        #db.authenticate configArgs.mongo.account, configArgs.mongo.password, (err, success) ->
        gridStore = new GridStore db, filename, "w", _options
        gridStore.open (err, gridStore) ->
            gridStore.write content, (err, gridStore) ->
                gridStore.close (err, result) ->
                    cb(err)

    unlink: (filename, cb) ->
        _options = @options
        GridStore.unlink db, filename, _options, (err, content) ->
            cb(err)

    stream: (filename, cb) ->
        _options = @options
        gridStore = new GridStore db, filename, "r", _options
        gridStore.open (err, gridStore) ->
            fileStream = gridStore.stream(true)
            fileStream.on 'error', (error) ->
                console.log 'error', error
            fileStream.on 'end', (end) ->
                console.log 'end'
            cb(err, fileStream)

    exist: (filename, cb) ->
        _options = @options
        #db.authenticate configArgs.mongo.account, configArgs.mongo.password, (err, success) ->
        GridStore.exist db, filename, _options.root, (err, exist) ->
            cb err, exist

exports.GridFS = GridFS