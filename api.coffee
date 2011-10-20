model = require './model.js'
configArgs = require('./config.js').config
Db = require('mongodb').Db
GridStore = require('mongodb').GridStore
Server = require('mongodb').Server
fs = require 'fs'
User = model.User
db = null

getBasicUser = (req) ->
    if req.headers.authorization and req.headers.authorization.search('Basic ') is 0
        console.log req.headers.authorization
        authStr = new Buffer(req.headers.authorization.split(' ')[1], 'base64').toString().split(':')
        if authStr[0] is '' or authStr[1] is ''
            null
        else
            { username: authStr[0], password: authStr[1] }
    else null

unAuthorized = (res) ->
    res.header('WWW-Authenticate', 'Basic realm="SuperSonic"')
    res.send('Authentication required', 401)

getUser = (req, res, next) ->
    basicUser = getBasicUser(req)
    console.log 'basic', basicUser
    if basicUser
        db.user.findOne {username: basicUser.username}, (err, getedUser) ->
            console.log 'geted', getedUser
            if getedUser?
                getedUser = new User getedUser
                console.log 'auth', getedUser
                if getedUser.authenticate(basicUser.password)
                    delete getedUser.hashed_password
                    delete getedUser.salt
                    req.currentUser = getedUser
                    next()
                else
                    next()
            else next()
    else
        next()

httpAuthUser = (req, res, next) ->
    if req.form?
        req.form.complete (err, fields, files) ->
            req.form.on 'callback', (fn) ->
                fn err, fields, files
            getUser req, res, next

        # We can add listeners for several form
        # events such as "progress"
        req.form.on 'progress', (bytesReceived, bytesExpected) ->
            console.log 'on progress'
            percent = (bytesReceived / bytesExpected * 100) | 0;
            process.stdout.write 'Uploading: %' + percent + '\r'
    else getUser req, res, next

start = (app) ->
    db = app.db
    app.get '/api/account/verify_credentials.json', httpAuthUser, (req, res) ->
        if req.currentUser?
            res.send req.currentUser
        else
            unAuthorized res

    app.post '/api/post.json', httpAuthUser, (req, res) ->
        if req.currentUser?
            _user = req.currentUser
            req.form.emit 'callback', (err, fields, files) ->
                console.log 'post', fields
                console.log 'file', files
                console.log '\nuploaded %s to %s', files.audio.filename, files.audio.path
                format = files.audio.filename.substr files.audio.filename.lastIndexOf('.') + 1
                console.log 'format', format
                formats = ['mp3', 'wav', 'ogg', 'mp4']
                if formats.indexOf(format) is -1
                    return res.send {error: 'the file format is not supported'}
                post =
                    text: fields.text
                    u_id: _user._id
                    format: format,
                    time: parseInt(fields.time),
                    date: new Date()

                db.post.insert post, (err, replies) ->
                    console.log 'insert err', err
                    console.log 'post success', replies
                    db.user.updateById post.u_id.toString(), {'$inc': {num_posts: 1}}
                    db1 = new Db configArgs.mongo.dbname, new Server(configArgs.mongo.host, configArgs.mongo.port, {auto_reconnect: false})
                    db1.open (err, db1) ->
                        console.log 'db1', db1
                        db1.authenticate configArgs.mongo.account, configArgs.mongo.password, (err, success) ->
                            gridStore = new GridStore db1, replies[0]._id.toString(), "w", {'content_type':'audio/'+format, 'root':'audio', metadata: { format: format }}
                            gridStore.open (err, gridStore) ->
                                console.log 'grid open', err
                                gridStore.writeFile files.audio.path, (err, result) ->
                                    console.log 'write err', err
                                    gridStore.close (err, result) ->
                                        db1.close()
                                        fs.unlink files.audio.path, (err) ->
                                            console.log 'unlink', err
                                            console.log 'successfully deleted %s', files.audio.path
                                        res.send replies
        else
            unAuthorized res

    # app.get '/api/document/list.json', (req, res) ->
    #     httpAuthUser req, res, app, (authedUser) ->
    #         app.documentProvider.list {u_id: authedUser._id}, (err, documents) ->
    #             res.send documents

exports.start = start