configArgs = require('./config.js').config
model = require './model.js'
LoginToken = model.LoginToken
User = model.User
#step = require('./step.js')
GridStore = require('mongodb').GridStore
Db = require('mongodb').Db
Server = require('mongodb').Server
server_config = new Server configArgs.mongo.host, configArgs.mongo.port, {auto_reconnect: false}
fs = require 'fs'

route = (app) ->
    db = app.db

    authenticateFromLoginToken = (req, res, next) ->
        cookie = JSON.parse(req.cookies.logintoken)
        console.log('cookie', cookie)
        db.loginToken.findById cookie._id, (err, token) ->
            return next() if (!token)
            console.log 'token', token
            token = new LoginToken token
            if token.series is cookie.series
                if token.token isnt cookie.token         #unsafe
                    req.notSafe = true
            else
                res.clearCookie 'logintoken'
                return next()
            db.user.findById cookie._id, (err, user) ->
                if user
                    req.session.user_id = user._id
                    req.currentUser = user

                    token.token = token.randomToken()
                    db.loginToken.save token, (err) ->
                        res.cookie('logintoken', token.cookieValue(), { expires: new Date(Date.now() + 2 * 604800000), path: '/' })
                        next()
                else
                    next()

    getUser = (req, res, next) ->
       if req.session.user_id?
            db.user.findById req.session.user_id.toString(), (err, user) ->
                console.log('session user', user)
                if user?
                    req.currentUser = user
                    next()
                else
                    next()
        else if req.cookies.logintoken
            authenticateFromLoginToken(req, res, next)
        else
            next()

    loadUser = (req, res, next) ->
        console.log 'load session', req.session.user_id
        console.log 'load cookie', req.cookies.logintoken
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
        else
            getUser req, res, next


    app.get '/', loadUser, (req, res) ->
        if req.currentUser
            feeds = []
            count = 0
            req.currentUser.following.push req.currentUser._id.toString()
            console.log 'following', req.currentUser.following
            req.currentUser.following.forEach (item,index,list) ->
                db.user.findById item, (err, user) ->
                    db.post.findItems {u_id: user._id}, {limit:10, skip:0}, (err, posts) ->
                        posts.forEach (post) ->
                            post.user = user
                            feeds.push(post)
                        count++
                        if(count is list.length)
                            count = 0
                            feeds.sort (a,b)->
                                b.date.getTime() - a.date.getTime()
                            if feeds.length
                                feeds.forEach (feed, index, list) ->
                                    db.comment.findItems {p_id:feed._id}, (err, comments) ->
                                        feed.comments = comments
                                        count++
                                        if(count is list.length)
                                            console.log 'finish', feeds
                                            res.render 'home', {title: 'home', posts: feeds[0..10], user: req.currentUser, navLink: 'home', ifSelf: 'false'}
                            else res.render 'home', {title: 'home', posts: [], user: req.currentUser, navLink: 'home'}
        else
            res.render 'index',
                title: 'SuperSonic'

    app.get '/signup', loadUser, (req, res) ->
    #    res.send 'please wait'
        if req.currentUser
            res.redirect '/'
        else res.render 'signup', { title: 'signup' }

    app.post '/signup', (req, res, next) ->
        _user = req.body.user
        _user.password = _user.password.trim()
        _user.confirm_password = _user.confirm_password.trim()
        _user.username = _user.username.trim()
        _user.email = _user.email.trim()

        console.log _user
        if _user.password is '' or _user.confirm_password is '' or _user.username is '' or _user.email is ''
            req.flash 'error', '字段不能为空'
            return res.render 'signup', { title: 'signup'}
        if _user.password.length < 6
            req.flash 'error', '密码不能少于六位'
            return res.render 'signup', { title: 'signup'}
        if _user.password isnt _user.confirm_password
            req.flash 'error', '确认密码与密码不同'
            return res.render 'signup', { title: 'signup'}
        testReg = /^[\w\.\-\+]+@([\w\-]+\.)+[a-z]{2,4}$/
        if !testReg.test _user.email
            req.flash 'error', '邮箱格式不正确'
            return res.render 'signup', { title: 'signup'}
        _user = new User _user
        db.user.insert _user, {safe:true}, (err, replies) ->
            if err?
                if err.code is 11000
                    req.flash 'error', '用户名已存在'
                    res.render 'signup', { title: 'signup'}
                else
                    next err
            else
                console.log 'signup', replies
                req.session.user_id = replies[0]._id
                res.redirect '/'

    app.post '/login', (req, res) ->
        _user = req.body.user
        _user.password = _user.password.trim()
        _user.username = _user.username.trim()
        if _user.password is '' or  _user.username is ''
            req.flash 'error', '字段不能为空'
            return res.render 'index', { title: 'index'}
        db.user.findOne {username: _user.username}, (err, user) ->
            if user?
                user = new User user
                if user.authenticate(_user.password)
                    req.session.user_id = user._id
                    if req.body.remember_me
                        loginToken = new LoginToken({_id:user._id})
                        console.log loginToken
                        db.loginToken.save loginToken, (err, count) ->
                            res.cookie('logintoken', loginToken.cookieValue(), { expires: new Date(Date.now() + 2 * 604800000), path: '/' })
                    res.redirect '/'
                else
                    req.flash 'error', '用户名与密码不匹配'
                    res.redirect '/'
            else
                req.flash 'error', '没有这个用户'
                res.redirect '/'

    app.get '/logout', loadUser, (req, res) ->
        if req.session?
            db.loginToken.removeById req.session.user_id.toString(), ->
                res.clearCookie('logintoken')
                req.session.destroy()
        res.redirect '/'


    app.get '/post/new', loadUser, (req, res) ->
        if req.currentUser
            res.render 'post/new', { title:'new post', p:{}}
        else res.redirect '/'

    app.get '/settings', loadUser, (req, res) ->
        if req.currentUser
            res.render 'settings', { title:'settings', user:req.currentUser}
        else res.redirect '/'

    app.post '/user', loadUser, (req, res) ->
        if req.currentUser
            _user = req.currentUser
            req.form.emit 'callback', (err, fields, files) ->
                if (err)
                    console.log err
                else
                    console.log '\nuploaded %s to %s', files.avatar.filename, files.avatar.path
                    console.log 'fields', fields
                    if(fields.nick)
                        db.user.updateById _user._id.toString(), {'$set': {nick: fields.nick}}
                    db1 = new Db configArgs.mongo.dbname, new Server(configArgs.mongo.host, configArgs.mongo.port, {auto_reconnect: false})
                    db1.open (err, db1) ->
                        db1.authenticate configArgs.mongo.account, configArgs.mongo.password, (err, success) ->
                            gridStore = new GridStore db1, _user._id.toString(), "w", {'content_type':'image/jpeg', 'root':'avatar'}
                            gridStore.open (err, gridStore) ->
                                console.log 'open err', err
                                gridStore.writeFile files.avatar.path, (err, result) ->
                                    console.log 'write err', err
                                    gridStore.close (err, result) ->
                                        db1.close()
                                        fs.unlink files.avatar.path, (err) ->
                                            console.log err if err
                                            console.log 'successfully deleted %s', files.avatar.path
                            res.redirect '/'
        else res.redirect '/'

    app.get '/user/:username', loadUser, (req, res) ->
        db.user.findOne {username:req.params.username}, (err, user) ->
            if(user)
                localData =
                    title: user.nick+"'s page"
                    pageUser: user
                    isLoggedIn: false
                if(req.currentUser)
                    localData.isSelf = (req.currentUser.username is user.username)
                    user.isFollowing = req.currentUser.following.indexOf(user._id.toString()) isnt -1
                    localData.user = req.currentUser
                    localData.isLoggedIn = true
                    if(req.currentUser.username == user.username)
                        localData.navLink = 'user'
                    db.post.findItems {u_id: user._id}, {limit:10, skip:0}, (err, posts) ->
                        posts.forEach (post) ->
                            post.user = user
                        localData.posts = posts
                        res.render 'user', localData
                else res.render 'user', localData
            else
                res.send err

    app.put '/follow/:id', loadUser, (req, res) ->
        if(req.currentUser)
            currentUser = req.currentUser
            db.user.findById req.params.id, (err, user) ->
                if (user)
                    console.log 'follow user', user
                    db.user.update {_id:currentUser._id, following:{$ne: user._id.toString()}}, {$push: {'following': user._id.toString()}, $inc: {num_following: 1}}, {safe: true}, (err, count)->
                        console.log 'following err', err
                        console.log 'following count', count
                        db.user.update {_id:user._id, follower:{$ne: currentUser._id.toString()}}, {$push: {'follower': currentUser._id.toString()}, '$inc': {num_follower: 1}}, {safe: true}, (err, count)->
                            console.log 'follower count', count
                            console.log 'follower err', err
                            res.send 'success'
                else res.send 'error'
        else
            res.send 'error'

    app.put '/unfollow/:id', loadUser, (req, res) ->
        if(req.currentUser)
            currentUser = req.currentUser
            db.user.findById req.params.id, (err, user) ->
                if (user)
                    console.log 'unfollow user', user
                    db.user.update {_id:currentUser._id, following: user._id.toString()}, {$pull: {'following': user._id.toString()}, $inc: {num_following: -1}}, {safe: true}, (err, count)->
                        console.log 'unfollowing err', err
                        console.log 'unfollowing count', count
                        db.user.update {_id:user._id, follower: currentUser._id.toString()}, {$pull: {'follower': currentUser._id.toString()}, '$inc': {num_follower: -1}}, {safe: true}, (err, count)->
                            console.log 'follower count', count
                            console.log 'follower err', err
                            res.send 'success'
                else res.send 'error'
        else
            res.send 'error'

    app.post '/comment', loadUser, (req, res) ->
        _user = req.currentUser
        comment =
            p_id: db.comment.id(req.body.id)
            body: req.body.body
            time: req.body.time
            date: new Date()
            u:
                _id: _user._id
                username: _user.username
        db.comment.insert comment, (err, replies) ->
            console.log replies[0]
            res.send replies[0]

    app.post '/post', loadUser, (req, res) ->
        if req.currentUser
            _user = req.currentUser
            req.form.emit 'callback', (err, fields, files) ->
                if (err)
                    console.log err
                else
                    console.log 'file', files
                    console.log '\nuploaded %s to %s', files.audio.filename, files.audio.path
                    format = files.audio.filename.substr files.audio.filename.lastIndexOf('.') + 1
                    console.log 'format', format
                    formats = ['mp3', 'wav', 'ogg', 'mp4']
                    return res.redirect 'back' if formats.indexOf(format) is -1
                    post =
                        text: fields.text
                        u_id: _user._id
                        format: format,
                        time: 52846, #TODO
                        date: new Date()

                    db.post.insert post, (err, replies) ->
                        console.log 'saved post', replies
                        #db.feed.insert {_id:replies[0]._id, u_id:_user._id}
                        db.user.updateById post.u_id.toString(), {'$inc': {num_posts: 1}}
                        db1 = new Db configArgs.mongo.dbname, new Server(configArgs.mongo.host, configArgs.mongo.port, {auto_reconnect: false})
                        db1.open (err, db1) ->
                            db1.authenticate configArgs.mongo.account, configArgs.mongo.password, (err, success) ->
                                console.log 'err', err
                                gridStore = new GridStore db1, replies[0]._id.toString(), "w", {'content_type':'audio/'+format, 'root':'audio', metadata: { format: format }}
                                gridStore.open (err, gridStore) ->
                                    console.log 'open err', err
                                    gridStore.writeFile files.audio.path, (err, result) ->
                                        console.log 'write err', err
                                        gridStore.close (err, result) ->
                                            db1.close()
                                            fs.unlink files.audio.path, (err) ->
                                                console.log err if err
                                                console.log 'successfully deleted %s', files.audio.path
                                        res.redirect '/'

        else res.redirect '/'

    app.del '/post/:id.:format?', loadUser, (req, res) ->
        db.post.removeById req.params.id, (err, p) ->
            db.comment.remove {p_id: db.comment.id(req.params.id)}, (err, comment) ->
                console.log 'delete comment', comment
            db.user.updateById req.currentUser._id.toString(), {'$inc': {num_posts: -1}}
            griddb = new Db configArgs.mongo.dbname, new Server(configArgs.mongo.host, configArgs.mongo.port, {auto_reconnect: false})
            griddb.open (err, griddb) ->
                GridStore.unlink griddb, req.params.id, { 'content_type':'audio/mpeg', 'root':'audio' }, (err, content) ->
                    console.log 'err', err
                    griddb.close()
            res.send('1')

    app.get '/audio/:id.:format', (req, res) ->
        griddb = new Db configArgs.mongo.dbname, new Server(configArgs.mongo.host, configArgs.mongo.port, {auto_reconnect: false})
        griddb.open (err, griddb) ->
            griddb.authenticate configArgs.mongo.account, configArgs.mongo.password, (err, success) ->
                gridStore = new GridStore griddb, req.params.id, "r", { 'content_type':'audio/mpeg', 'root':'audio',  }
                gridStore.open (err, gridStore) ->
                    res.contentType 'audio/'+req.params.format
                    fileStream = gridStore.stream(true)
                    # fileStream.on 'data', (data) ->
                    #     console.log 'data', data
                    fileStream.on 'error', (error) ->
                        console.log 'error', error
                    fileStream.on 'end', (end) ->
                        console.log 'end'
                        griddb.close()
                    fileStream.pipe(res)
            # GridStore.read griddb, req.params.id, (err, content) ->
            #     console.log 'err', err
            #     res.contentType 'audio/mpeg'
            #     console.log content
            #     res.send new Buffer(content, "binary")
            #     griddb.close()

    app.get '/avatar/:id', (req, res) ->
        griddb = new Db configArgs.mongo.dbname, new Server(configArgs.mongo.host, configArgs.mongo.port, {auto_reconnect: false})
        griddb.open (err, griddb) ->
            griddb.authenticate configArgs.mongo.account, configArgs.mongo.password, (err, success) ->
                gridStore = new GridStore griddb, req.params.id, "r", { 'content_type':'image/jpeg', 'root':'avatar' }
                gridStore.open (err, gridStore) ->
                    res.contentType 'image/jpeg'
                    fileStream = gridStore.stream(true)
                    # fileStream.on 'data', (data) ->
                    #     console.log 'data', data
                    fileStream.on 'error', (error) ->
                        console.log 'error', error
                    fileStream.on 'end', (end) ->
                        console.log 'end'
                        griddb.close()
                    fileStream.pipe(res)

exports.route = route