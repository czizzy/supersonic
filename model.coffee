crypto = require('crypto')

###*
* User construction
*
* @param {String} name (optional)
* @param {String} password (optional)
###

class User
    constructor: (obj) ->
        @username = obj.username
        @email = obj.email
        @nick = obj.nick or @username
        @salt = obj.salt or @makeSalt()
        @hashed_password = obj.hashed_password or @encryptPassword(obj.password)
        @num_posts = if obj.num_posts? then obj.num_posts else 0
        @num_following = if obj.num_following? then obj.num_following else 0
        @num_follower = if obj.num_follower? then obj.num_follower else 0
        @following = if obj.following? then obj.following else []
        @follower = if obj.follower? then obj.follower else []
        @_id = obj._id if obj._id?


    makeSalt: ->
        Math.round(new Date().valueOf() * Math.random()) + ''

    encryptPassword: (password) ->
        crypto.createHmac('sha1', @salt).update(password).digest('hex')

    authenticate: (plainText) ->
        @encryptPassword(plainText) is @hashed_password


###*
* LoginToken construction
*
* @param {String} email
* @param {String} series
* @param {String} token
###

class LoginToken
    constructor: (obj) ->
        @series = obj.series or @randomToken()
        @token = obj.token or @randomToken()
        @_id = obj._id
    randomToken: ->
        Math.round((new Date().valueOf() * Math.random())) + ''
    cookieValue: ->
        JSON.stringify {_id: @_id, token: @token, series: @series}

exports.User = User
exports.LoginToken = LoginToken



