(function() {
  var Db, GridStore, LoginToken, Server, User, configArgs, fs, model, route, server_config;
  configArgs = require('./config.js').config;
  model = require('./model.js');
  LoginToken = model.LoginToken;
  User = model.User;
  GridStore = require('mongodb').GridStore;
  Db = require('mongodb').Db;
  Server = require('mongodb').Server;
  server_config = new Server(configArgs.mongo.host, configArgs.mongo.port, {
    auto_reconnect: false
  });
  fs = require('fs');
  route = function(app) {
    var authenticateFromLoginToken, db, getUser, loadUser;
    db = app.db;
    authenticateFromLoginToken = function(req, res, next) {
      var cookie;
      cookie = JSON.parse(req.cookies.logintoken);
      console.log('cookie', cookie);
      return db.loginToken.findById(cookie._id, function(err, token) {
        if (!token) {
          return next();
        }
        console.log('token', token);
        token = new LoginToken(token);
        if (token.series === cookie.series) {
          if (token.token !== cookie.token) {
            req.notSafe = true;
          }
        } else {
          res.clearCookie('logintoken');
          return next();
        }
        return db.user.findById(cookie._id, function(err, user) {
          if (user) {
            req.session.user_id = user._id;
            req.currentUser = user;
            token.token = token.randomToken();
            return db.loginToken.save(token, function(err) {
              res.cookie('logintoken', token.cookieValue(), {
                expires: new Date(Date.now() + 2 * 604800000),
                path: '/'
              });
              return next();
            });
          } else {
            return next();
          }
        });
      });
    };
    getUser = function(req, res, next) {
      if (req.session.user_id != null) {
        return db.user.findById(req.session.user_id, function(err, user) {
          console.log('session user', user);
          if (user != null) {
            req.currentUser = user;
            return next();
          } else {
            return next();
          }
        });
      } else if (req.cookies.logintoken) {
        return authenticateFromLoginToken(req, res, next);
      } else {
        return next();
      }
    };
    loadUser = function(req, res, next) {
      console.log('load session', req.session.user_id);
      console.log('load cookie', req.cookies.logintoken);
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
    app.get('/', loadUser, function(req, res) {
      var count, feeds;
      if (req.currentUser) {
        feeds = [];
        count = 0;
        req.currentUser.following.push(req.currentUser._id.toString());
        console.log('following', req.currentUser.following);
        return req.currentUser.following.forEach(function(item, index, list) {
          return db.user.findById(item, function(err, user) {
            return db.post.findItems({
              u_id: user._id
            }, {
              limit: 10,
              skip: 0
            }, function(err, posts) {
              posts.forEach(function(post) {
                post.user = user;
                return feeds.push(post);
              });
              count++;
              if (count === list.length) {
                count = 0;
                feeds.sort(function(a, b) {
                  return b.date.getTime() - a.date.getTime();
                });
                if (feeds.length) {
                  return feeds.forEach(function(feed, index, list) {
                    return db.comment.findItems({
                      p_id: feed._id
                    }, function(err, comments) {
                      feed.comments = comments;
                      count++;
                      if (count === list.length) {
                        console.log('finish', feeds);
                        return res.render('home', {
                          title: 'home',
                          posts: feeds.slice(0, 11),
                          user: req.currentUser,
                          navLink: 'home',
                          ifSelf: 'false'
                        });
                      }
                    });
                  });
                } else {
                  return res.render('home', {
                    title: 'home',
                    posts: [],
                    user: req.currentUser,
                    navLink: 'home'
                  });
                }
              }
            });
          });
        });
      } else {
        return res.render('index', {
          title: 'SuperSonic'
        });
      }
    });
    app.get('/signup', loadUser, function(req, res) {
      if (req.currentUser) {
        return res.redirect('/');
      } else {
        return res.render('signup', {
          title: 'signup'
        });
      }
    });
    app.post('/signup', function(req, res, next) {
      var testReg, _user;
      _user = req.body.user;
      _user.password = _user.password.trim();
      _user.confirm_password = _user.confirm_password.trim();
      _user.username = _user.username.trim();
      _user.email = _user.email.trim();
      console.log(_user);
      if (_user.password === '' || _user.confirm_password === '' || _user.username === '' || _user.email === '') {
        req.flash('error', '字段不能为空');
        return res.render('signup', {
          title: 'signup'
        });
      }
      if (_user.password.length < 6) {
        req.flash('error', '密码不能少于六位');
        return res.render('signup', {
          title: 'signup'
        });
      }
      if (_user.password !== _user.confirm_password) {
        req.flash('error', '确认密码与密码不同');
        return res.render('signup', {
          title: 'signup'
        });
      }
      testReg = /^[\w\.\-\+]+@([\w\-]+\.)+[a-z]{2,4}$/;
      if (!testReg.test(_user.email)) {
        req.flash('error', '邮箱格式不正确');
        return res.render('signup', {
          title: 'signup'
        });
      }
      _user = new User(_user);
      return db.user.insert(_user, {
        safe: true
      }, function(err, replies) {
        if (err != null) {
          if (err.code === 11000) {
            req.flash('error', '用户名已存在');
            return res.render('signup', {
              title: 'signup'
            });
          } else {
            return next(err);
          }
        } else {
          console.log('signup', replies);
          req.session.user_id = replies[0]._id;
          return res.redirect('/');
        }
      });
    });
    app.post('/login', function(req, res) {
      var _user;
      _user = req.body.user;
      _user.password = _user.password.trim();
      _user.username = _user.username.trim();
      if (_user.password === '' || _user.username === '') {
        req.flash('error', '字段不能为空');
        return res.render('index', {
          title: 'index'
        });
      }
      return db.user.findOne({
        username: _user.username
      }, function(err, user) {
        var loginToken;
        if (user != null) {
          user = new User(user);
          if (user.authenticate(_user.password)) {
            req.session.user_id = user._id;
            if (req.body.remember_me) {
              loginToken = new LoginToken({
                _id: user._id
              });
              console.log(loginToken);
              db.loginToken.save(loginToken, function(err, count) {
                return res.cookie('logintoken', loginToken.cookieValue(), {
                  expires: new Date(Date.now() + 2 * 604800000),
                  path: '/'
                });
              });
            }
            return res.redirect('/');
          } else {
            req.flash('error', '用户名与密码不匹配');
            return res.redirect('/');
          }
        } else {
          req.flash('error', '没有这个用户');
          return res.redirect('/');
        }
      });
    });
    app.get('/logout', loadUser, function(req, res) {
      if (req.session != null) {
        db.loginToken.removeById(req.session.user_id, function() {
          res.clearCookie('logintoken');
          return req.session.destroy();
        });
      }
      return res.redirect('/');
    });
    app.get('/post/new', loadUser, function(req, res) {
      if (req.currentUser) {
        return res.render('post/new', {
          title: 'new post',
          p: {}
        });
      } else {
        return res.redirect('/');
      }
    });
    app.get('/settings', loadUser, function(req, res) {
      if (req.currentUser) {
        return res.render('settings', {
          title: 'settings',
          user: req.currentUser
        });
      } else {
        return res.redirect('/');
      }
    });
    app.post('/user', loadUser, function(req, res) {
      var _user;
      if (req.currentUser) {
        _user = req.currentUser;
        return req.form.emit('callback', function(err, fields, files) {
          var db1;
          if (err) {
            return console.log(err);
          } else {
            console.log('\nuploaded %s to %s', files.avatar.filename, files.avatar.path);
            console.log('fields', fields);
            if (fields.nick) {
              db.user.updateById(_user._id.toString(), {
                '$set': {
                  nick: fields.nick
                }
              });
            }
            db1 = new Db(configArgs.mongo.dbname, new Server(configArgs.mongo.host, configArgs.mongo.port, {
              auto_reconnect: false
            }));
            return db1.open(function(err, db1) {
              return db1.authenticate(configArgs.mongo.account, configArgs.mongo.password, function(err, success) {
                var gridStore;
                gridStore = new GridStore(db1, _user._id.toString(), "w", {
                  'content_type': 'image/jpeg',
                  'root': 'avatar'
                });
                gridStore.open(function(err, gridStore) {
                  console.log('open err', err);
                  return gridStore.writeFile(files.avatar.path, function(err, result) {
                    console.log('write err', err);
                    return gridStore.close(function(err, result) {
                      db1.close();
                      return fs.unlink(files.avatar.path, function(err) {
                        if (err) {
                          console.log(err);
                        }
                        return console.log('successfully deleted %s', files.avatar.path);
                      });
                    });
                  });
                });
                return res.redirect('/');
              });
            });
          }
        });
      } else {
        return res.redirect('/');
      }
    });
    app.get('/user/:username', loadUser, function(req, res) {
      return db.user.findOne({
        username: req.params.username
      }, function(err, user) {
        var localData;
        if (user) {
          localData = {
            title: user.nick + "'s page",
            pageUser: user,
            isLoggedIn: false
          };
          if (req.currentUser) {
            localData.isSelf = req.currentUser.username === user.username;
            user.isFollowing = req.currentUser.following.indexOf(user._id.toString()) !== -1;
            localData.user = req.currentUser;
            localData.isLoggedIn = true;
            if (req.currentUser.username === user.username) {
              localData.navLink = 'user';
            }
            return db.post.findItems({
              u_id: user._id
            }, {
              limit: 10,
              skip: 0
            }, function(err, posts) {
              posts.forEach(function(post) {
                return post.user = user;
              });
              localData.posts = posts;
              return res.render('user', localData);
            });
          } else {
            return res.render('user', localData);
          }
        } else {
          return res.send(err);
        }
      });
    });
    app.put('/follow/:id', loadUser, function(req, res) {
      var currentUser;
      if (req.currentUser) {
        currentUser = req.currentUser;
        return db.user.findById(req.params.id, function(err, user) {
          if (user) {
            console.log('follow user', user);
            return db.user.update({
              _id: currentUser._id,
              following: {
                $ne: user._id.toString()
              }
            }, {
              $push: {
                'following': user._id.toString()
              },
              $inc: {
                num_following: 1
              }
            }, {
              safe: true
            }, function(err, count) {
              console.log('following err', err);
              console.log('following count', count);
              return db.user.update({
                _id: user._id,
                follower: {
                  $ne: currentUser._id.toString()
                }
              }, {
                $push: {
                  'follower': currentUser._id.toString()
                },
                '$inc': {
                  num_follower: 1
                }
              }, {
                safe: true
              }, function(err, count) {
                console.log('follower count', count);
                console.log('follower err', err);
                return res.send('success');
              });
            });
          } else {
            return res.send('error');
          }
        });
      } else {
        return res.send('error');
      }
    });
    app.put('/unfollow/:id', loadUser, function(req, res) {
      var currentUser;
      if (req.currentUser) {
        currentUser = req.currentUser;
        return db.user.findById(req.params.id, function(err, user) {
          if (user) {
            console.log('unfollow user', user);
            return db.user.update({
              _id: currentUser._id,
              following: user._id.toString()
            }, {
              $pull: {
                'following': user._id.toString()
              },
              $inc: {
                num_following: -1
              }
            }, {
              safe: true
            }, function(err, count) {
              console.log('unfollowing err', err);
              console.log('unfollowing count', count);
              return db.user.update({
                _id: user._id,
                follower: currentUser._id.toString()
              }, {
                $pull: {
                  'follower': currentUser._id.toString()
                },
                '$inc': {
                  num_follower: -1
                }
              }, {
                safe: true
              }, function(err, count) {
                console.log('follower count', count);
                console.log('follower err', err);
                return res.send('success');
              });
            });
          } else {
            return res.send('error');
          }
        });
      } else {
        return res.send('error');
      }
    });
    app.post('/comment', loadUser, function(req, res) {
      var comment, _user;
      _user = req.currentUser;
      comment = {
        p_id: db.comment.id(req.body.id),
        body: req.body.body,
        time: req.body.time,
        date: new Date(),
        u: {
          _id: _user._id,
          username: _user.username
        }
      };
      return db.comment.insert(comment, function(err, replies) {
        console.log(replies[0]);
        return res.send(replies[0]);
      });
    });
    app.post('/post', loadUser, function(req, res) {
      var _user;
      if (req.currentUser) {
        _user = req.currentUser;
        return req.form.emit('callback', function(err, fields, files) {
          var format, formats, post;
          if (err) {
            return console.log(err);
          } else {
            console.log('file', files);
            console.log('\nuploaded %s to %s', files.audio.filename, files.audio.path);
            format = files.audio.filename.substr(files.audio.filename.lastIndexOf('.') + 1);
            console.log('format', format);
            formats = ['mp3', 'wav', 'ogg', 'mp4'];
            if (formats.indexOf(format) === -1) {
              return res.redirect('back');
            }
            post = {
              text: fields.text,
              u_id: _user._id,
              format: format,
              time: 52846,
              date: new Date()
            };
            return db.post.insert(post, function(err, replies) {
              var db1;
              console.log('saved post', replies);
              db.user.updateById(post.u_id.toString(), {
                '$inc': {
                  num_posts: 1
                }
              });
              db1 = new Db(configArgs.mongo.dbname, new Server(configArgs.mongo.host, configArgs.mongo.port, {
                auto_reconnect: false
              }));
              return db1.open(function(err, db1) {
                return db1.authenticate(configArgs.mongo.account, configArgs.mongo.password, function(err, success) {
                  var gridStore;
                  console.log('err', err);
                  gridStore = new GridStore(db1, replies[0]._id.toString(), "w", {
                    'content_type': 'audio/' + format,
                    'root': 'audio',
                    metadata: {
                      format: format
                    }
                  });
                  return gridStore.open(function(err, gridStore) {
                    console.log('open err', err);
                    return gridStore.writeFile(files.audio.path, function(err, result) {
                      console.log('write err', err);
                      gridStore.close(function(err, result) {
                        db1.close();
                        return fs.unlink(files.audio.path, function(err) {
                          if (err) {
                            console.log(err);
                          }
                          return console.log('successfully deleted %s', files.audio.path);
                        });
                      });
                      return res.redirect('/');
                    });
                  });
                });
              });
            });
          }
        });
      } else {
        return res.redirect('/');
      }
    });
    app.del('/post/:id.:format?', loadUser, function(req, res) {
      return db.post.removeById(req.params.id, function(err, p) {
        var griddb;
        db.comment.remove({
          p_id: db.comment.id(req.params.id)
        }, function(err, comment) {
          return console.log('delete comment', comment);
        });
        db.user.updateById(req.currentUser._id.toString(), {
          '$inc': {
            num_posts: -1
          }
        });
        griddb = new Db(configArgs.mongo.dbname, new Server(configArgs.mongo.host, configArgs.mongo.port, {
          auto_reconnect: false
        }));
        griddb.open(function(err, griddb) {
          return GridStore.unlink(griddb, req.params.id, {
            'content_type': 'audio/mpeg',
            'root': 'audio'
          }, function(err, content) {
            console.log('err', err);
            return griddb.close();
          });
        });
        return res.send('1');
      });
    });
    app.get('/audio/:id.:format', function(req, res) {
      var griddb;
      griddb = new Db(configArgs.mongo.dbname, new Server(configArgs.mongo.host, configArgs.mongo.port, {
        auto_reconnect: false
      }));
      return griddb.open(function(err, griddb) {
        var gridStore;
        gridStore = new GridStore(griddb, req.params.id, "r", {
          'content_type': 'audio/mpeg',
          'root': 'audio'
        });
        return gridStore.open(function(err, gridStore) {
          var fileStream;
          res.contentType('audio/' + req.params.format);
          fileStream = gridStore.stream(true);
          fileStream.on('error', function(error) {
            return console.log('error', error);
          });
          fileStream.on('end', function(end) {
            console.log('end');
            return griddb.close();
          });
          return fileStream.pipe(res);
        });
      });
    });
    return app.get('/avatar/:id', function(req, res) {
      var griddb;
      griddb = new Db(configArgs.mongo.dbname, new Server(configArgs.mongo.host, configArgs.mongo.port, {
        auto_reconnect: false
      }));
      return griddb.open(function(err, griddb) {
        var gridStore;
        gridStore = new GridStore(griddb, req.params.id, "r", {
          'content_type': 'image/jpeg',
          'root': 'avatar'
        });
        return gridStore.open(function(err, gridStore) {
          var fileStream;
          res.contentType('image/jpeg');
          fileStream = gridStore.stream(true);
          fileStream.on('error', function(error) {
            return console.log('error', error);
          });
          fileStream.on('end', function(end) {
            console.log('end');
            return griddb.close();
          });
          return fileStream.pipe(res);
        });
      });
    });
  };
  exports.route = route;
}).call(this);
