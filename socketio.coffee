parseCookie = require('connect').utils.parseCookie;

listen = (app) ->
    db = app.db
    io = app.io
    # authenticateFromCookie = (cookie, success, fail) ->
    #     console.log('cookie', cookie)
    #     cookie = JSON.parse cookie.logintoken
    #     console.log('cookie', cookie)

        # db.loginToken.findById cookie._id, (err, token) ->
        #     return fail() if (!token)
        #     console.log 'token', token
        #     # token = new LoginToken token
        #     if token.series is cookie.series
        #         if token.token isnt cookie.token         #unsafe
        #             req.notSafe = true
        #     else
        #         return fail()
        #     db.user.findById cookie._id, (err, user) ->
        #         if user
        #             success(user)
        #         else
        #             fail()

    # socket.io
    io.configure ()->
        io.set 'authorization', (handshakeData, callback)->
            cookie = parseCookie handshakeData.headers.cookie
            # console.log 'id', cookie['connect.sid']
            app.sessionStore.get cookie['connect.sid'], (err, session)->
                # console.log err, session
                if(err || !session)
                    callback null, false
                else
                    handshakeData.user_id = session.user_id
                    callback null, true
            # authenticateFromCookie cookie, (user)->
            #     handshakeData.user = user
            #     callback null, true
            # , ()->
            #     callback null, false

    io.sockets.on 'error', (reason)->
        console.log 'socket.io error:', reason

    io.sockets.on 'connection', (socket)->
        # console.log 'client', io.sockets.sockets[socket.id]
        # console.log 'client', socket
        app.clients[socket.handshake.user_id] = socket.id
        # console.log 'clients', app.clients
        # console.log socket
        # count = 1
        # setInterval ()->
        #     socket.emit 'news', {data: count++}
        # , 1000
        # socket.emit 'auth', {user: socket.handshake.user}
        # socket.on 'my other event', (data)->
        #     console.log data
        socket.on 'disconnect', (a)->
            delete app.clients[socket.handshake.user_id]
            console.log 'clients', app.clients
            console.log 'disconnect', a

exports.listen = listen