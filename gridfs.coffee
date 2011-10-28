configArgs = require('./config.js').config
GridStore = require('mongodb').GridStore
Db = require('mongodb').Db
Server = require('mongodb').Server
server_config = new Server configArgs.mongo.host, configArgs.mongo.port, {auto_reconnect: true}
db = new Db configArgs.mongo.dbname, server_config
db.open (err, db) ->
    console.log "%s grid fs is open", root

class GridFS
    constructor:(root) ->
        @root = root

    writeFile: (filename, path, cb) ->
        _root = @root
        #db.authenticate configArgs.mongo.account, configArgs.mongo.password, (err, success) ->
        gridStore = new GridStore db, filename, "w", {'root':_root}
        gridStore.open (err, gridStore) ->
            console.log 'open err', err
            gridStore.writeFile path, (err, result) ->
                console.log 'result err', err
                console.log result, 'result'
                gridStore.close (err, result) ->
                    cb(err, result)

    unlink: (filename, cb) ->
        _root = @root
        GridStore.unlink db, filename, { 'root': _root }, (err, content) ->
            cb(err)

    stream: (filename, cb) ->
        _root = @root
        console.log filename
        gridStore = new GridStore db, filename, "r", { 'root':_root }
        console.log gridStore
        gridStore.open (err, gridStore) ->
            console.log 'open', filename
            console.log 'err', err
            fileStream = gridStore.stream(true)
            fileStream.on 'error', (error) ->
                console.log 'error', error
            fileStream.on 'end', (end) ->
                console.log 'end'
            cb(err, fileStream)

    exist: (filename, cb) ->
        _root = @root
        #db.authenticate configArgs.mongo.account, configArgs.mongo.password, (err, success) ->
        GridStore.exist db, filename, _root, (err, exist) ->
            cb err, exist

exports.GridFS = GridFS