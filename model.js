(function() {
  var LoginToken, User, crypto;
  crypto = require('crypto');
  /**
  * User construction
  *
  * @param {String} name (optional)
  * @param {String} password (optional)
  */
  User = (function() {
    function User(obj) {
      this.username = obj.username;
      this.email = obj.email;
      this.nick = obj.nick || this.username;
      this.salt = obj.salt || this.makeSalt();
      this.hashed_password = obj.hashed_password || this.encryptPassword(obj.password);
      this.num_posts = obj.num_posts != null ? obj.num_posts : 0;
      this.num_following = obj.num_following != null ? obj.num_following : 0;
      this.num_follower = obj.num_follower != null ? obj.num_follower : 0;
      this.num_fav = obj.num_fav != null ? obj.num_fav : 0;
      this.avatar = obj.avatar != null ? obj.avatar : null;
      if (obj._id != null) {
        this._id = obj._id;
      }
    }
    User.prototype.makeSalt = function() {
      return Math.round(new Date().valueOf() * Math.random()) + '';
    };
    User.prototype.encryptPassword = function(password) {
      return crypto.createHmac('sha1', this.salt).update(password).digest('hex');
    };
    User.prototype.authenticate = function(plainText) {
      return this.encryptPassword(plainText) === this.hashed_password;
    };
    return User;
  })();
  /**
  * LoginToken construction
  *
  * @param {String} email
  * @param {String} series
  * @param {String} token
  */
  LoginToken = (function() {
    function LoginToken(obj) {
      this.series = obj.series || this.randomToken();
      this.token = obj.token || this.randomToken();
      this._id = obj._id;
    }
    LoginToken.prototype.randomToken = function() {
      return Math.round(new Date().valueOf() * Math.random()) + '';
    };
    LoginToken.prototype.cookieValue = function() {
      return JSON.stringify({
        _id: this._id,
        token: this.token,
        series: this.series
      });
    };
    return LoginToken;
  })();
  exports.User = User;
  exports.LoginToken = LoginToken;
}).call(this);
