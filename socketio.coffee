parseCookie = require('connect').utils.parseCookie;

listen = (app) ->
    db = app.db
    io = app.io

    # socket.io
    io.configure ()->
        io.set 'authorization', (handshakeData, callback)->
            cookie = parseCookie handshakeData.headers.cookie
            app.sessionStore.get cookie['connect.sid'], (err, session)->
                if(err || !session)
                    callback null, false
                else
                    handshakeData.user_id = session.user_id
                    callback null, true

    io.sockets.on 'connection', (socket)->
        app.clients[socket.handshake.user_id] = socket.id
        socket.on 'disconnect', (a)->
            delete app.clients[socket.handshake.user_id]

    io.sockets.on 'error', (reason)->
        console.log 'socket.io error:', reason

exports.listen = listen