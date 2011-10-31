model = require './model.js'
LoginToken = model.LoginToken
User = model.User
im = require 'imagemagick'
fs = require 'fs'
async = require 'async'

route = (app) ->
    db = app.db
    avatarFS = app.avatarFS
    audioFS = app.audioFS

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

    getFeeds = (currentUser, lastDt, fn) ->
        feeds = {}
        feeds.items = []
        feeds.hasMore = false
        count = 0
        hasFeedUsers = []
        async.waterfall [
            (callback)->
                db.follow.findItems {from:currentUser._id}, {limit:1000}, (err, followings) ->
                    followings = followings.map (item)->
                        item.to
                    followings.push(currentUser._id)
                    callback(null, followings)
            , (followings, callback)->
                if lastDt
                    selector = {u_id: {$in:followings}, date:{'$lt':lastDt}}
                else
                    selector = {u_id: {$in:followings}}
                db.post.find selector, {sort:{date:-1}, limit:10}, (err, postsCursor)->
                    async.parallel {
                        count: (cb)->
                            postsCursor.count (err, count)->
                                cb(err, count)
                        items: (cb)->
                            postsCursor.toArray (err, posts)->
                                cb(err, posts)
                    }, (err, results)->
                        feeds = {}
                        feeds.hasMore = results.count>10
                        posts = results.items
                        async.forEach posts, (item, cb)->
                            async.parallel {
                                comments:(cb2)->
                                    db.comment.findItems {p_id:item._id}, (err, comments) ->
                                        cb2(err, comments)
                                user:(cb2)->
                                    db.user.findOne {_id:item.u_id}, (err, user)->
                                        cb2(err, user)
                            }, (err, results)->
                                item.comments = results.comments
                                item.user = results.user
                                cb(err)
                        , (err)->
                            feeds.items = posts
                            console.log 'feed', feeds
                            fn feeds
                            callback(null, 'done')
        ]

    app.get '/feeds', loadUser, (req, res) ->
        if req.currentUser
            getFeeds req.currentUser, new Date(req.query.dt), (feeds) ->
                res.send feeds
        else
            res.send {error:'请先登录'}

    app.get '/', loadUser, (req, res) ->
        if req.currentUser
            getFeeds req.currentUser, null, (feeds) ->
                res.render 'home', {title: 'home', posts: feeds, user: req.currentUser, navLink: 'home', ifSelf: 'false'}
        else
            res.render 'index',
                title: 'SuperSonic'

    app.get '/signup', loadUser, (req, res) ->
        if req.currentUser
            res.redirect '/'
        else res.render 'signup', { title: 'signup' }

    app.post '/signup', (req, res, next) ->
        _user = req.body.user
        _user.password = _user.password.trim()
        _user.confirm_password = _user.confirm_password.trim()
        _user.username = _user.username.trim()
        _user.email = _user.email.trim()

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
                console.log '\nuploaded %s to %s', files.avatar.filename, files.avatar.path
                if(fields.nick)
                    db.user.update {_id:_user._id}, {'$set': {nick: fields.nick}}
                if(files.avatar.size>0)
                    im.identify files.avatar.path, (err, features)->
                        imageFormats = ['JPEG', 'PNG', 'GIF']
                        if(features? and imageFormats.indexOf(features.format) != -1)
                            size = if features.width <= features.height then features.width else features.height
                            cropPath = files.avatar.path+'_cropped'
                            im.crop {srcPath: files.avatar.path, dstPath: cropPath, width: size}, (err, stdout, stderr) ->
                                fs.unlink files.avatar.path, (err) ->
                                    console.log 'successfully deleted %s', files.avatar.path
                                avatarData = fs.readFileSync(cropPath, 'binary')
                                avatarVer = parseInt(Math.random()*10000)
                                async.parallel [
                                    (callback)->
                                        db.user.update {_id: _user._id }, {'$set':{avatar:'/avatar/'+_user._id.toString()+'/'+avatarVer}}, (err, count)->
                                            callback err, count
                                    (callback)->
                                        resizeFunc = (size, cb) ->
                                            im.resize {srcData: avatarData, width: size, format: 'jpg'}, (err, stdout, stderr) ->
                                                avatarFS.write _user._id.toString()+'_'+size, stdout, (err, result) ->
                                                    cb()
                                        async.forEach [128, 48, 32], resizeFunc, (err)->
                                            fs.unlink cropPath, (err) ->
                                                console.log 'successfully deleted %s', cropPath
                                            callback err
                                ], (err, results)->
                                    res.redirect '/user/'+_user.username
                        else
                            req.flash 'error', '不支持的图像格式'
                            res.render 'settings', {title: '个人设置', user:_user}
                else
                    res.redirect '/user/'+_user.username
        else res.redirect '/'

    app.get '/user/:username', loadUser, (req, res) ->
        db.user.findOne {username:req.params.username}, (err, user) ->
            if(user)
                page = if (req.query.page? and !isNaN(req.query.page)) then req.query.page else 1
                localData =
                    title: user.nick+"的主页"
                    pageUser: user
                    isLoggedIn: false
                    page: page
                    userNav: 'track'
                if(req.currentUser)
                    _currentUser = req.currentUser
                    localData.isSelf = (_currentUser.username is user.username)
                    async.parallel {
                        isFollowing: (callback)->
                            db.follow.findOne {from:_currentUser._id, to:user._id}, (err, follow) ->
                                callback null, follow?
                        posts: (callback)->
                            db.post.find {u_id: user._id}, {sort:{date: -1}, limit:10, skip:10*(page-1)}, (err, cursor) ->
                                async.parallel {
                                    count:(cb)->
                                        cursor.count (err,count) ->
                                            cb(err, count)
                                    items:(cb)->
                                        cursor.toArray (err,posts) ->
                                            cb(err, posts)
                                }, (err, results)->
                                    feeds = {}
                                    feeds.num_items = results.count
                                    feeds.items = results.items
                                    async.forEach feeds.items, (item, cb)->
                                        async.parallel {
                                            comments:(cb2)->
                                                db.comment.findItems {p_id:item._id}, (err, comments) ->
                                                    cb2(err, comments)
                                            user:(cb2)->
                                                cb2(err, user)
                                        }, (err, results)->
                                            item.comments = results.comments
                                            item.user = results.user
                                            cb(err)
                                    , (err)->
                                        callback err, feeds
                    }, (err, results) ->
                        user.isFollowing = results.isFollowing
                        localData.posts = results.posts
                        localData.user = _currentUser
                        localData.isLoggedIn = true
                        localData.uri = req.url
                        if(req.currentUser.username == user.username)
                            localData.navLink = 'user'
                        res.render 'user', localData
                else res.render 'user', localData
            else
                res.send err

    app.get '/user/:username/following', loadUser, (req, res) ->
        db.user.findOne {username:req.params.username}, (err, user) ->
            if(user)
                page = if (req.query.page? and !isNaN(req.query.page)) then req.query.page else 1
                localData =
                    title: user.nick+"的关注"
                    pageUser: user
                    isLoggedIn: false
                    page: page
                    userNav: 'following'
                if(req.currentUser)
                    _currentUser = req.currentUser

                    async.parallel {
                        isFollowing: (callback)->
                            db.follow.findOne {from:_currentUser._id, to:user._id}, (err, follow) ->
                                callback null, follow?
                        users: (callback)->
                            skip = (page-1)*10
                            db.follow.findItems {from:user._id}, {skip:skip, limit:10}, (err, followings) ->
                                async.map followings, (item, cb)->
                                    db.user.findOne {_id: item.to}, (err, user) ->
                                        cb(err, user)
                                , (err, results)->
                                    callback null, results
                    }, (err, results) ->
                        localData.isSelf = _currentUser.username is user.username
                        user.isFollowing = results.isFollowing
                        localData.users = results.users
                        localData.user = req.currentUser
                        localData.isLoggedIn = true
                        localData.uri = req.url
                        res.render 'follow', localData
                else res.render 'follow', localData
            else
                res.send err

    app.get '/user/:username/follower', loadUser, (req, res) ->
        db.user.findOne {username:req.params.username}, (err, user) ->
            if(user)
                page = if (req.query.page? and !isNaN(req.query.page)) then req.query.page else 1
                localData =
                    title: user.nick+"的粉丝"
                    pageUser: user
                    isLoggedIn: false
                    page: page
                    userNav: 'follower'
                if(req.currentUser)
                    _currentUser = req.currentUser
                    async.parallel {
                        isFollowing: (callback)->
                            db.follow.findOne {from:_currentUser._id, to:user._id}, (err, follow) ->
                                callback null, follow?
                        users: (callback)->
                            skip = (page-1)*10
                            db.follow.findItems {to:user._id}, {skip:skip, limit:10}, (err, followers) ->
                                async.map followers, (item, cb)->
                                    db.user.findOne {_id: item.from}, (err, user) ->
                                        cb(err, user)
                                , (err, results)->
                                    callback null, results
                    }, (err, results) ->
                        localData.isSelf = _currentUser.username is user.username
                        user.isFollowing = results.isFollowing
                        localData.users = results.users
                        localData.user = req.currentUser
                        localData.isLoggedIn = true
                        localData.uri = req.url
                        res.render 'follow', localData
                else res.render 'follow', localData
            else
                res.send err


    app.put '/follow/:id', loadUser, (req, res) ->
        if(req.currentUser)
            currentUser = req.currentUser
            db.user.findById req.params.id, (err, user) ->
                if (user)
                    db.follow.insert {from:currentUser._id, to:user._id}, {safe:true}, (err, replies) ->
                        if err?
                            if err.code is 11000
                                res.send 'success'
                            else res.send err
                        else
                            async.parallel [
                                (callback)->
                                    db.user.update {_id:currentUser._id}, {$inc: {num_following: 1}}, (err, count)->
                                        callback err, count
                                (callback)->
                                    db.user.update {_id:user._id}, {$inc: {num_follower: 1}}, (err, count)->
                                        callback err, count
                            ], (err, results)->
                                if err?
                                    res.send err
                                else
                                    console.log 'follow', results
                                    res.send 'success'
                else res.send 'user not found'
        else
            res.send 'error'

    app.put '/unfollow/:id', loadUser, (req, res) ->
        if(req.currentUser)
            currentUser = req.currentUser
            db.user.findById req.params.id, (err, user) ->
                if (user)
                    db.follow.remove {from:currentUser._id, to:user._id}, (err, follow) ->
                        if(err?)
                            res.send err
                        else
                            async.parallel [
                                (callback)->
                                    db.user.update {_id:currentUser._id}, {$inc: {num_following: -1}}, (err, count)->
                                        callback(err, count)
                                (callback)->
                                    db.user.update {_id:user._id}, {$inc: {num_follower: -1}}, (err, count)->
                                        callback(err, count)
                            ], (err, results)->
                                if err?
                                    res.send err
                                else
                                    console.log 'unfollow', results
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
                nick: _user.nick
        db.comment.insert comment, (err, replies) ->
            res.send replies[0]

    app.post '/post', loadUser, (req, res) ->
        if req.currentUser
            _user = req.currentUser
            req.form.emit 'callback', (err, fields, files) ->
                console.log 'file', files
                console.log '\nuploaded %s to %s', files.audio.filename, files.audio.path
                format = files.audio.filename.substr files.audio.filename.lastIndexOf('.') + 1
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
                    audioFS.writeFile replies[0]._id.toString(), files.audio.path, (err, result) ->
                        fs.unlink files.audio.path, (err) ->
                            console.log 'successfully deleted %s', files.audio.path
                        res.redirect '/'

        else res.redirect '/'

    app.del '/post/:id.:format?', loadUser, (req, res) ->
        db.post.removeById req.params.id, (err, p) ->
            db.comment.remove {p_id: db.comment.id(req.params.id)}, (err, comment) ->
                console.log 'delete comment', comment
            db.user.updateById req.currentUser._id.toString(), {'$inc': {num_posts: -1}}
            audioFS.unlink req.params.id, (err) ->
            res.send('1')

    app.get '/audio/:id.:format', (req, res) ->
        audioFS.stream req.params.id, (err, stream) ->
            res.contentType 'audio/'+req.params.format
            stream.pipe(res)

    app.get '/avatar/:id/:ver', (req, res) ->
        size=req.query.size
        if size is '32' or size is '48' or size is '128'
            _filename = req.params.id + '_' + size
            # avatarFS.exist _filename, (err, exist) ->
            #     if exist
            avatarFS.stream _filename, (err, stream) ->
                res.contentType 'image/jpeg'
                stream.pipe(res)
                # else res.sendfile('public/images/avatar-default-'+size+'.png')
        else res.end 'size should be 32, 48, 128'

exports.route = route