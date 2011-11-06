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
    wfFS = app.wfFS

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
                percent = (bytesReceived / bytesExpected * 100) | 0;
                process.stdout.write 'Uploading: %' + percent + '\r'
        else
            getUser req, res, next

    getPost = (item, currentUser, callback) ->
        item.text = item.text.replace('</script>','<#script>')
        async.parallel
            comments:(cb2)->
                db.comment.findItems {p:item._id}, (err, comments) ->
                    async.forEach comments, (comment, cb3)->
                        date = comment.date
                        comment.date = date.getFullYear()+'-'+(date.getMonth()+1)+'-'+date.getDate()+' '+date.getHours()+':'+date.getMinutes()
                        comment.body = comment.body.replace('</script>','<#script>')
                        db.user.findOne {_id: comment.u._id}, (err, user)->
                            comment.u = user
                            cb3(err)
                    , (err) ->
                        cb2(err, comments)
            user:(cb2)->
                db.user.findOne {_id:item.u}, (err, user)->
                    cb2(err, user)
            isFav:(cb2)->
                db.fav.findOne {u:currentUser._id, p:item._id}, (err, fav)->
                    cb2(err, fav)
        , (err, results)->
            item.comments = results.comments
            item.user = results.user
            item.isFav = results.isFav?
            callback(err, item)

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
                    selector = {u: {$in:followings}, date:{'$lt':lastDt}}
                else
                    selector = {u: {$in:followings}}
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
                            getPost item, currentUser, (err, post)->
                                cb(err, post)
                        , (err)->
                            feeds.items = posts
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
                res.render 'home', {title: 'SuperSonic', posts: feeds, user: req.currentUser, navLink: 'home', ifSelf: 'false'}
        else
            res.render 'index',
                title: 'SuperSonic'

    app.get '/signup', loadUser, (req, res) ->
        if req.currentUser
            res.redirect '/'
        else res.render 'signup', { title: '注册' }

    app.post '/signup', (req, res, next) ->
        _user = req.body.user
        _user.password = _user.password.trim()
        _user.confirm_password = _user.confirm_password.trim()
        _user.username = _user.username.trim()
        _user.email = _user.email.trim()

        if _user.password is '' or _user.confirm_password is '' or _user.username is '' or _user.email is ''
            req.flash 'error', '字段不能为空'
            return res.render 'signup', { title: '注册'}
        if _user.password.length < 6
            req.flash 'error', '密码不能少于六位'
            return res.render 'signup', { title: '注册'}
        if _user.password isnt _user.confirm_password
            req.flash 'error', '确认密码与密码不同'
            return res.render 'signup', { title: '注册'}
        testReg = /^[\w\.\-\+]+@([\w\-]+\.)+[a-z]{2,4}$/
        if !testReg.test _user.email
            req.flash 'error', '邮箱格式不正确'
            return res.render 'signup', { title: '注册'}
        _user = new User _user
        db.user.insert _user, {safe:true}, (err, replies) ->
            if err?
                if err.code is 11000
                    req.flash 'error', '用户名已存在'
                    res.render 'signup', { title: '注册'}
                else
                    next err
            else
                req.session.user_id = replies[0]._id
                res.redirect '/'

    app.post '/login', (req, res, next) ->
        _user = req.body.user
        _user.password = _user.password.trim()
        _user.username = _user.username.trim()
        if _user.password is '' or  _user.username is ''
            req.flash 'error', '字段不能为空'
            return res.render 'index', { title: '登录'}
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
        else
            res.redirect '/'

    app.get '/settings', loadUser, (req, res) ->
        if req.currentUser
            res.render 'settings', { title:'设置', user:req.currentUser}
        else res.redirect '/'

    app.post '/user', loadUser, (req, res, next) ->
        if req.currentUser
            _user = req.currentUser
            req.form.emit 'callback', (err, fields, files) ->
                if(fields.nick)
                    db.user.update {_id:_user._id}, {'$set': {nick: fields.nick}}
                if(files.avatar.size>0)
                    console.log '\nuploaded %s to %s', files.avatar.filename, files.avatar.path
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
                                    if(err)
                                        next err
                                    else
                                        req.flash 'info', '用户资料修改成功'
                                        res.redirect '/user/'+_user.username
                        else
                            req.flash 'error', '不支持的图像格式'
                            res.render 'settings', {title: '个人设置', user:_user}
                else
                    req.flash 'info', '用户资料修改成功'
                    res.redirect '/user/'+_user.username
        else res.redirect '/'

    app.get '/user/:username', loadUser, (req, res, next) ->
        db.user.findOne {username:req.params.username}, (err, user) ->
            if(err or not user?)
                err = err or '没有这个用户'
                next err
            else if(user)
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
                            db.post.find {u: user._id}, {sort:{date: -1}, limit:10, skip:10*(page-1)}, (err, cursor) ->
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
                                        getPost item, _currentUser, (err, post)->
                                            cb err, post
                                    , (err)->
                                        callback err, feeds
                    }, (err, results) ->
                        if err
                            next err
                        else
                            user.isFollowing = results.isFollowing
                            localData.posts = results.posts
                            localData.user = _currentUser
                            localData.isLoggedIn = true
                            localData.uri = req.url
                            if(req.currentUser.username == user.username)
                                localData.navLink = 'user'
                            res.render 'user', localData
                else res.render 'user', localData

    app.get '/user/:username/fav', loadUser, (req, res, next) ->
        db.user.findOne {username:req.params.username}, (err, user) ->
            if(err or not user?)
                err = err or '没有这个用户'
                next err
            else if(user)
                page = if (req.query.page? and !isNaN(req.query.page)) then req.query.page else 1
                localData =
                    title: user.nick+"的收藏"
                    pageUser: user
                    isLoggedIn: false
                    page: page
                    userNav: 'fav'
                if(req.currentUser)
                    _currentUser = req.currentUser
                    localData.isSelf = (_currentUser.username is user.username)
                    async.parallel {
                        isFollowing: (callback)->
                            db.follow.findOne {from:_currentUser._id, to:user._id}, (err, follow) ->
                                callback null, follow?
                        posts: (callback)->
                            db.fav.find {u: user._id}, {sort:{date: -1}, limit:10, skip:10*(page-1)}, (err, cursor) ->
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
                                    ids = results.items.map (item)->
                                        item.p
                                    feeds.items = []
                                    db.post.findItems {_id:{$in:ids}}, (err, posts)->
                                        async.forEach posts, (post, cb)->
                                            getPost post, _currentUser, (err, post)->
                                                cb err, post
                                        , (err)->
                                            posts.sort (x, y)->
                                                y.date.getTime()-x.date.getTime()
                                            feeds.items = posts
                                            callback err, feeds
                    }, (err, results) ->
                        if err
                            next err
                        else
                            user.isFollowing = results.isFollowing
                            localData.posts = results.posts
                            localData.user = _currentUser
                            localData.isLoggedIn = true
                            localData.uri = req.url
                            res.render 'user', localData
                else res.render 'user', localData
            else
                res.send err


    app.get '/user/:username/following', loadUser, (req, res, next) ->
        db.user.findOne {username:req.params.username}, (err, user) ->
            if(err or not user?)
                err = err or '没有这个用户'
                next err
            else if(user)
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
                        if(err)
                            next(err)
                        else
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

    app.get '/user/:username/follower', loadUser, (req, res, next) ->
        db.user.findOne {username:req.params.username}, (err, user) ->
            if(err or not user?)
                err = err or '没有这个用户'
                next err
            else if(user)
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
                        if(err)
                            next err
                        else
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

    app.put '/follow/:id', loadUser, (req, res, next) ->
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
                                if err
                                    next
                                else
                                    res.send 'success'
                else res.send 'user not found'
        else
            res.send 'error'

    app.put '/unfollow/:id', loadUser, (req, res, next) ->
        if(req.currentUser)
            currentUser = req.currentUser
            db.user.findById req.params.id, (err, user) ->
                if (user)
                    db.follow.remove {from:currentUser._id, to:user._id}, (err, follow) ->
                        if(err?)
                            next err
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
                                    next err
                                else
                                    res.send 'success'
                else res.send 'error'
        else
            res.send 'error'

    app.post '/comment', loadUser, (req, res, next) ->
        _user = req.currentUser
        comment =
            p: db.comment.id(req.body.id)
            body: req.body.body
            time: req.body.time
            date: new Date()
            u:
                _id: _user._id
        db.comment.insert comment, (err, replies) ->
            if(err)
                next err
            else
                replies[0].u = _user
                date = replies[0].date
                replies[0].date = date.getFullYear()+'-'+(date.getMonth()+1)+'-'+date.getDate()+' '+date.getHours()+':'+date.getMinutes()
                res.send replies[0]

    app.del '/post/:id.:format?', loadUser, (req, res, next) ->
        p_id = req.params.id
        async.parallel
            post: (cb)->
                db.post.removeById p_id, (err) ->
                    cb(err)
            comment: (cb)->
                db.comment.remove {p: db.comment.id(p_id)}, (err) ->
                    cb(err)
            userCount: (cb)->
                db.user.updateById req.currentUser._id.toString(), {'$inc': {num_posts: -1}}, (err)->
                    cb(err)
            audio: (cb)->
                audioFS.unlink p_id, (err) ->
                    cb(err)
            waveform: (cb)->
                wfFS.unlink p_id, (err) ->
                    cb(err)
            fav: (cb)->
                db.fav.findItems {p: db.fav.id(p_id)}, (err, favs)->
                    if favs.length
                        async.forEach favs, (item,cb2)->
                            async.parallel
                                fav:(cb3)->
                                    db.fav.remove {p:item.p}, (err)->
                                        cb3(err)
                                userCount:(cb3)->
                                    db.user.update {_id:item.u}, {$inc:{num_fav:-1}}, (err)->
                                        cb3(err)
                            , (err, result)->
                                cb2(err)
                        , (err)->
                            cb(err)
                    else
                        cb(null)
        , (err, results)->
            if(err)
                next err
            else
                res.send('1')

    app.post '/post/fav/:id', loadUser, (req, res, next) ->
        db.fav.insert {p: db.post.id(req.params.id), u: req.currentUser._id}, {safe: true}, (err, f) ->
            if err
                if err.code is 11000
                   res.send '1'
                else
                    next err
            else
                async.parallel [
                    (cb)->
                        db.post.updateById req.params.id, {'$inc': {num_fav: 1}}, (err)->
                            cb(err)
                    , (cb)->
                        db.user.update {_id:req.currentUser._id}, {'$inc': {num_fav: 1}}, (err)->
                            cb(err)
                ], (err, result)->
                    if(err)
                        next err
                    else
                        res.send('1')

    app.del '/post/fav/:id', loadUser, (req, res, next) ->
        selector = {p: db.post.id(req.params.id), u: req.currentUser._id}
        db.fav.findOne selector, (err, f) ->
            if f
                db.fav.remove selector, (err, result)->
                    async.parallel [
                        (cb)->
                            db.post.updateById req.params.id, {'$inc': {num_fav: -1}}, (err)->
                                cb(err)
                        , (cb)->
                            db.user.update {_id:req.currentUser._id}, {'$inc': {num_fav: -1}}, (err)->
                                cb(err)
                    ], (err, result)->
                        if(err)
                            next err
                        else
                            res.send('1')
            else
               res.send '1'


    app.get '/audio/:id.:format', (req, res, next) ->
        audioFS.stream req.params.id, (err, stream) ->
            if(err)
                next err
            else
                res.contentType 'audio/'+req.params.format
                stream.pipe(res)

    app.get '/waveform/:id', (req, res, next) ->
        wfFS.stream req.params.id, (err, stream) ->
            if(err)
                next err
            else
                res.contentType 'audio/png'
                stream.pipe(res)

    app.get '/avatar/:id/:ver', (req, res, next) ->
        size=req.query.size
        if size is '32' or size is '48' or size is '128'
            _filename = req.params.id + '_' + size
            # avatarFS.exist _filename, (err, exist) ->
            #     if exist
            avatarFS.stream _filename, (err, stream) ->
                if(err)
                    next err
                else
                    res.contentType 'image/jpeg'
                    stream.pipe(res)
                    # else res.sendfile('public/images/avatar-default-'+size+'.png')
        else res.end 'size should be 32, 48, 128'


    app.get '/android-client', (req, res, next)->
        res.contentType 'application/zip'
        res.sendfile 'public/download/supersonic.zip'

exports.route = route