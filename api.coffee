model = require './model.js'
async = require 'async'
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
            if getedUser?
                getedUser = new User getedUser
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
    audioFS = app.audioFS
    wfFS = app.wfFS
    app.get '/api/account/verify_credentials.json', httpAuthUser, (req, res) ->
        if req.currentUser?
            res.send req.currentUser
        else
            unAuthorized res

    app.post '/api/post.json', httpAuthUser, (req, res) ->
        if req.currentUser?
            _user = req.currentUser
            req.form.emit 'callback', (err, fields, files) ->
                console.log '\nuploaded %s to %s', files.audio.filename, files.audio.path
                format = files.audio.filename.substr files.audio.filename.lastIndexOf('.') + 1
                console.log 'format', format
                formats = ['mp3', 'wav', 'ogg', 'mp4']
                if formats.indexOf(format) is -1
                    fs.unlink files.audio.path, (err) ->
                        console.log 'unlink', err
                        console.log 'successfully deleted %s', files.audio.path
                    return res.send {error: 'the file format is not supported'}
                post =
                    text: fields.text
                    u: _user._id
                    format: format,
                    time: parseInt(fields.time),
                    date: new Date(),
                    num_favs: 0

                console.log 'post', post
                db.post.insert post, (err, replies) ->
                    console.log 'post success', replies
                    async.parallel
                        user: (cb)->
                            db.user.updateById post.u.toString(), {'$inc': {num_posts: 1}}, (err, result)->
                                cb err, result
                        audio: (cb)->
                            audioFS.writeFile replies[0]._id.toString(), files.audio.path, (err, result) ->
                                fs.unlink files.audio.path, (err) ->
                                    console.log 'successfully deleted %s', files.audio.path
                                cb err, result
                        waveform: (cb)->
                            wfFS.writeFile replies[0]._id.toString(), files.waveform.path, (err, result) ->
                                fs.unlink files.waveform.path, (err) ->
                                    console.log 'successfully deleted %s', files.waveform.path
                                cb err, result
                    , (err, results)->
                        res.send replies
        else
            req.form.emit 'callback', (err, fields, files) ->
                fs.unlink files.audio.path, (err) ->
                    console.log 'successfully deleted %s', files.audio.path
            unAuthorized res

exports.start = start