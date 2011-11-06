(function() {
  var User, async, db, fs, getBasicUser, getUser, httpAuthUser, model, start, unAuthorized;
  model = require('./model.js');
  async = require('async');
  fs = require('fs');
  User = model.User;
  db = null;
  getBasicUser = function(req) {
    var authStr;
    if (req.headers.authorization && req.headers.authorization.search('Basic ') === 0) {
      console.log(req.headers.authorization);
      authStr = new Buffer(req.headers.authorization.split(' ')[1], 'base64').toString().split(':');
      if (authStr[0] === '' || authStr[1] === '') {
        return null;
      } else {
        return {
          username: authStr[0],
          password: authStr[1]
        };
      }
    } else {
      return null;
    }
  };
  unAuthorized = function(res) {
    res.header('WWW-Authenticate', 'Basic realm="SuperSonic"');
    return res.send('Authentication required', 401);
  };
  getUser = function(req, res, next) {
    var basicUser;
    basicUser = getBasicUser(req);
    console.log('basic', basicUser);
    if (basicUser) {
      return db.user.findOne({
        username: basicUser.username
      }, function(err, getedUser) {
        if (getedUser != null) {
          getedUser = new User(getedUser);
          if (getedUser.authenticate(basicUser.password)) {
            delete getedUser.hashed_password;
            delete getedUser.salt;
            req.currentUser = getedUser;
            return next();
          } else {
            return next();
          }
        } else {
          return next();
        }
      });
    } else {
      return next();
    }
  };
  httpAuthUser = function(req, res, next) {
    if (req.form != null) {
      req.form.complete(function(err, fields, files) {
        req.form.on('callback', function(fn) {
          return fn(err, fields, files);
        });
        return getUser(req, res, next);
      });
      return req.form.on('progress', function(bytesReceived, bytesExpected) {
        var percent;
        console.log('on progress');
        percent = (bytesReceived / bytesExpected * 100) | 0;
        return process.stdout.write('Uploading: %' + percent + '\r');
      });
    } else {
      return getUser(req, res, next);
    }
  };
  start = function(app) {
    var audioFS, wfFS;
    db = app.db;
    audioFS = app.audioFS;
    wfFS = app.wfFS;
    app.get('/api/account/verify_credentials.json', httpAuthUser, function(req, res) {
      if (req.currentUser != null) {
        return res.send(req.currentUser);
      } else {
        return unAuthorized(res);
      }
    });
    return app.post('/api/post.json', httpAuthUser, function(req, res) {
      var _user;
      if (req.currentUser != null) {
        _user = req.currentUser;
        return req.form.emit('callback', function(err, fields, files) {
          var format, formats, post;
          console.log('\nuploaded %s to %s', files.audio.filename, files.audio.path);
          format = files.audio.filename.substr(files.audio.filename.lastIndexOf('.') + 1);
          console.log('format', format);
          formats = ['mp3', 'wav', 'ogg', 'mp4'];
          if (formats.indexOf(format) === -1) {
            fs.unlink(files.audio.path, function(err) {
              console.log('unlink', err);
              return console.log('successfully deleted %s', files.audio.path);
            });
            return res.send({
              error: 'the file format is not supported'
            });
          }
          post = {
            text: fields.text,
            u: _user._id,
            format: format,
            time: parseInt(fields.time),
            date: new Date(),
            num_favs: 0
          };
          console.log('post', post);
          return db.post.insert(post, function(err, replies) {
            console.log('post success', replies);
            return async.parallel({
              user: function(cb) {
                return db.user.updateById(post.u.toString(), {
                  '$inc': {
                    num_posts: 1
                  }
                }, function(err, result) {
                  return cb(err, result);
                });
              },
              audio: function(cb) {
                return audioFS.writeFile(replies[0]._id.toString(), files.audio.path, function(err, result) {
                  fs.unlink(files.audio.path, function(err) {
                    return console.log('successfully deleted %s', files.audio.path);
                  });
                  return cb(err, result);
                });
              },
              waveform: function(cb) {
                return wfFS.writeFile(replies[0]._id.toString(), files.waveform.path, function(err, result) {
                  fs.unlink(files.waveform.path, function(err) {
                    return console.log('successfully deleted %s', files.waveform.path);
                  });
                  return cb(err, result);
                });
              }
            }, function(err, results) {
              return res.send(replies);
            });
          });
        });
      } else {
        req.form.emit('callback', function(err, fields, files) {
          return fs.unlink(files.audio.path, function(err) {
            return console.log('successfully deleted %s', files.audio.path);
          });
        });
        return unAuthorized(res);
      }
    });
  };
  exports.start = start;
}).call(this);
