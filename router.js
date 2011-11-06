(function() {
  var LoginToken, User, async, fs, im, model, route;
  model = require('./model.js');
  LoginToken = model.LoginToken;
  User = model.User;
  im = require('imagemagick');
  fs = require('fs');
  async = require('async');
  route = function(app) {
    var audioFS, authenticateFromLoginToken, avatarFS, db, getFeeds, getPost, getUser, loadUser, wfFS;
    db = app.db;
    avatarFS = app.avatarFS;
    audioFS = app.audioFS;
    wfFS = app.wfFS;
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
        return db.user.findById(req.session.user_id.toString(), function(err, user) {
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
          percent = (bytesReceived / bytesExpected * 100) | 0;
          return process.stdout.write('Uploading: %' + percent + '\r');
        });
      } else {
        return getUser(req, res, next);
      }
    };
    getPost = function(item, currentUser, callback) {
      item.text = item.text.replace('</script>', '<#script>');
      return async.parallel({
        comments: function(cb2) {
          return db.comment.findItems({
            p: item._id
          }, function(err, comments) {
            return async.forEach(comments, function(comment, cb3) {
              var date;
              date = comment.date;
              comment.date = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() + ' ' + date.getHours() + ':' + date.getMinutes();
              comment.body = comment.body.replace('</script>', '<#script>');
              return db.user.findOne({
                _id: comment.u._id
              }, function(err, user) {
                comment.u = user;
                return cb3(err);
              });
            }, function(err) {
              return cb2(err, comments);
            });
          });
        },
        user: function(cb2) {
          return db.user.findOne({
            _id: item.u
          }, function(err, user) {
            return cb2(err, user);
          });
        },
        isFav: function(cb2) {
          return db.fav.findOne({
            u: currentUser._id,
            p: item._id
          }, function(err, fav) {
            return cb2(err, fav);
          });
        }
      }, function(err, results) {
        item.comments = results.comments;
        item.user = results.user;
        item.isFav = results.isFav != null;
        return callback(err, item);
      });
    };
    getFeeds = function(currentUser, lastDt, fn) {
      var count, feeds, hasFeedUsers;
      feeds = {};
      feeds.items = [];
      feeds.hasMore = false;
      count = 0;
      hasFeedUsers = [];
      return async.waterfall([
        function(callback) {
          return db.follow.findItems({
            from: currentUser._id
          }, {
            limit: 1000
          }, function(err, followings) {
            followings = followings.map(function(item) {
              return item.to;
            });
            followings.push(currentUser._id);
            return callback(null, followings);
          });
        }, function(followings, callback) {
          var selector;
          if (lastDt) {
            selector = {
              u: {
                $in: followings
              },
              date: {
                '$lt': lastDt
              }
            };
          } else {
            selector = {
              u: {
                $in: followings
              }
            };
          }
          return db.post.find(selector, {
            sort: {
              date: -1
            },
            limit: 10
          }, function(err, postsCursor) {
            return async.parallel({
              count: function(cb) {
                return postsCursor.count(function(err, count) {
                  return cb(err, count);
                });
              },
              items: function(cb) {
                return postsCursor.toArray(function(err, posts) {
                  return cb(err, posts);
                });
              }
            }, function(err, results) {
              var posts;
              feeds = {};
              feeds.hasMore = results.count > 10;
              posts = results.items;
              return async.forEach(posts, function(item, cb) {
                return getPost(item, currentUser, function(err, post) {
                  return cb(err, post);
                });
              }, function(err) {
                feeds.items = posts;
                fn(feeds);
                return callback(null, 'done');
              });
            });
          });
        }
      ]);
    };
    app.get('/feeds', loadUser, function(req, res) {
      if (req.currentUser) {
        return getFeeds(req.currentUser, new Date(req.query.dt), function(feeds) {
          return res.send(feeds);
        });
      } else {
        return res.send({
          error: '请先登录'
        });
      }
    });
    app.get('/', loadUser, function(req, res) {
      if (req.currentUser) {
        return getFeeds(req.currentUser, null, function(feeds) {
          return res.render('home', {
            title: 'SuperSonic',
            posts: feeds,
            user: req.currentUser,
            navLink: 'home',
            ifSelf: 'false'
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
          title: '注册'
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
      if (_user.password === '' || _user.confirm_password === '' || _user.username === '' || _user.email === '') {
        req.flash('error', '字段不能为空');
        return res.render('signup', {
          title: '注册'
        });
      }
      if (_user.password.length < 6) {
        req.flash('error', '密码不能少于六位');
        return res.render('signup', {
          title: '注册'
        });
      }
      if (_user.password !== _user.confirm_password) {
        req.flash('error', '确认密码与密码不同');
        return res.render('signup', {
          title: '注册'
        });
      }
      testReg = /^[\w\.\-\+]+@([\w\-]+\.)+[a-z]{2,4}$/;
      if (!testReg.test(_user.email)) {
        req.flash('error', '邮箱格式不正确');
        return res.render('signup', {
          title: '注册'
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
              title: '注册'
            });
          } else {
            return next(err);
          }
        } else {
          req.session.user_id = replies[0]._id;
          return res.redirect('/');
        }
      });
    });
    app.post('/login', function(req, res, next) {
      var _user;
      _user = req.body.user;
      _user.password = _user.password.trim();
      _user.username = _user.username.trim();
      if (_user.password === '' || _user.username === '') {
        req.flash('error', '字段不能为空');
        return res.render('index', {
          title: '登录'
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
        return db.loginToken.removeById(req.session.user_id.toString(), function() {
          res.clearCookie('logintoken');
          req.session.destroy();
          return res.redirect('/');
        });
      } else {
        return res.redirect('/');
      }
    });
    app.get('/settings', loadUser, function(req, res) {
      if (req.currentUser) {
        return res.render('settings', {
          title: '设置',
          user: req.currentUser
        });
      } else {
        return res.redirect('/');
      }
    });
    app.post('/user', loadUser, function(req, res, next) {
      var _user;
      if (req.currentUser) {
        _user = req.currentUser;
        return req.form.emit('callback', function(err, fields, files) {
          if (fields.nick) {
            db.user.update({
              _id: _user._id
            }, {
              '$set': {
                nick: fields.nick
              }
            });
          }
          if (files.avatar.size > 0) {
            console.log('\nuploaded %s to %s', files.avatar.filename, files.avatar.path);
            return im.identify(files.avatar.path, function(err, features) {
              var cropPath, imageFormats, size;
              imageFormats = ['JPEG', 'PNG', 'GIF'];
              if ((features != null) && imageFormats.indexOf(features.format) !== -1) {
                size = features.width <= features.height ? features.width : features.height;
                cropPath = files.avatar.path + '_cropped';
                return im.crop({
                  srcPath: files.avatar.path,
                  dstPath: cropPath,
                  width: size
                }, function(err, stdout, stderr) {
                  var avatarData, avatarVer;
                  fs.unlink(files.avatar.path, function(err) {
                    return console.log('successfully deleted %s', files.avatar.path);
                  });
                  avatarData = fs.readFileSync(cropPath, 'binary');
                  avatarVer = parseInt(Math.random() * 10000);
                  return async.parallel([
                    function(callback) {
                      return db.user.update({
                        _id: _user._id
                      }, {
                        '$set': {
                          avatar: '/avatar/' + _user._id.toString() + '/' + avatarVer
                        }
                      }, function(err, count) {
                        return callback(err, count);
                      });
                    }, function(callback) {
                      var resizeFunc;
                      resizeFunc = function(size, cb) {
                        return im.resize({
                          srcData: avatarData,
                          width: size,
                          format: 'jpg'
                        }, function(err, stdout, stderr) {
                          return avatarFS.write(_user._id.toString() + '_' + size, stdout, function(err, result) {
                            return cb();
                          });
                        });
                      };
                      return async.forEach([128, 48, 32], resizeFunc, function(err) {
                        fs.unlink(cropPath, function(err) {
                          return console.log('successfully deleted %s', cropPath);
                        });
                        return callback(err);
                      });
                    }
                  ], function(err, results) {
                    if (err) {
                      return next(err);
                    } else {
                      req.flash('info', '用户资料修改成功');
                      return res.redirect('/user/' + _user.username);
                    }
                  });
                });
              } else {
                req.flash('error', '不支持的图像格式');
                return res.render('settings', {
                  title: '个人设置',
                  user: _user
                });
              }
            });
          } else {
            req.flash('info', '用户资料修改成功');
            return res.redirect('/user/' + _user.username);
          }
        });
      } else {
        return res.redirect('/');
      }
    });
    app.get('/user/:username', loadUser, function(req, res, next) {
      return db.user.findOne({
        username: req.params.username
      }, function(err, user) {
        var localData, page, _currentUser;
        if (err || !(user != null)) {
          err = err || '没有这个用户';
          return next(err);
        } else if (user) {
          page = (req.query.page != null) && !isNaN(req.query.page) ? req.query.page : 1;
          localData = {
            title: user.nick + "的主页",
            pageUser: user,
            isLoggedIn: false,
            page: page,
            userNav: 'track'
          };
          if (req.currentUser) {
            _currentUser = req.currentUser;
            localData.isSelf = _currentUser.username === user.username;
            return async.parallel({
              isFollowing: function(callback) {
                return db.follow.findOne({
                  from: _currentUser._id,
                  to: user._id
                }, function(err, follow) {
                  return callback(null, follow != null);
                });
              },
              posts: function(callback) {
                return db.post.find({
                  u: user._id
                }, {
                  sort: {
                    date: -1
                  },
                  limit: 10,
                  skip: 10 * (page - 1)
                }, function(err, cursor) {
                  return async.parallel({
                    count: function(cb) {
                      return cursor.count(function(err, count) {
                        return cb(err, count);
                      });
                    },
                    items: function(cb) {
                      return cursor.toArray(function(err, posts) {
                        return cb(err, posts);
                      });
                    }
                  }, function(err, results) {
                    var feeds;
                    feeds = {};
                    feeds.num_items = results.count;
                    feeds.items = results.items;
                    return async.forEach(feeds.items, function(item, cb) {
                      return getPost(item, _currentUser, function(err, post) {
                        return cb(err, post);
                      });
                    }, function(err) {
                      return callback(err, feeds);
                    });
                  });
                });
              }
            }, function(err, results) {
              if (err) {
                return next(err);
              } else {
                user.isFollowing = results.isFollowing;
                localData.posts = results.posts;
                localData.user = _currentUser;
                localData.isLoggedIn = true;
                localData.uri = req.url;
                if (req.currentUser.username === user.username) {
                  localData.navLink = 'user';
                }
                return res.render('user', localData);
              }
            });
          } else {
            return res.render('user', localData);
          }
        }
      });
    });
    app.get('/user/:username/fav', loadUser, function(req, res, next) {
      return db.user.findOne({
        username: req.params.username
      }, function(err, user) {
        var localData, page, _currentUser;
        if (err || !(user != null)) {
          err = err || '没有这个用户';
          return next(err);
        } else if (user) {
          page = (req.query.page != null) && !isNaN(req.query.page) ? req.query.page : 1;
          localData = {
            title: user.nick + "的收藏",
            pageUser: user,
            isLoggedIn: false,
            page: page,
            userNav: 'fav'
          };
          if (req.currentUser) {
            _currentUser = req.currentUser;
            localData.isSelf = _currentUser.username === user.username;
            return async.parallel({
              isFollowing: function(callback) {
                return db.follow.findOne({
                  from: _currentUser._id,
                  to: user._id
                }, function(err, follow) {
                  return callback(null, follow != null);
                });
              },
              posts: function(callback) {
                return db.fav.find({
                  u: user._id
                }, {
                  sort: {
                    date: -1
                  },
                  limit: 10,
                  skip: 10 * (page - 1)
                }, function(err, cursor) {
                  return async.parallel({
                    count: function(cb) {
                      return cursor.count(function(err, count) {
                        return cb(err, count);
                      });
                    },
                    items: function(cb) {
                      return cursor.toArray(function(err, posts) {
                        return cb(err, posts);
                      });
                    }
                  }, function(err, results) {
                    var feeds, ids;
                    feeds = {};
                    feeds.num_items = results.count;
                    ids = results.items.map(function(item) {
                      return item.p;
                    });
                    feeds.items = [];
                    return db.post.findItems({
                      _id: {
                        $in: ids
                      }
                    }, function(err, posts) {
                      return async.forEach(posts, function(post, cb) {
                        return getPost(post, _currentUser, function(err, post) {
                          return cb(err, post);
                        });
                      }, function(err) {
                        posts.sort(function(x, y) {
                          return y.date.getTime() - x.date.getTime();
                        });
                        feeds.items = posts;
                        return callback(err, feeds);
                      });
                    });
                  });
                });
              }
            }, function(err, results) {
              if (err) {
                return next(err);
              } else {
                user.isFollowing = results.isFollowing;
                localData.posts = results.posts;
                localData.user = _currentUser;
                localData.isLoggedIn = true;
                localData.uri = req.url;
                return res.render('user', localData);
              }
            });
          } else {
            return res.render('user', localData);
          }
        } else {
          return res.send(err);
        }
      });
    });
    app.get('/user/:username/following', loadUser, function(req, res, next) {
      return db.user.findOne({
        username: req.params.username
      }, function(err, user) {
        var localData, page, _currentUser;
        if (err || !(user != null)) {
          err = err || '没有这个用户';
          return next(err);
        } else if (user) {
          page = (req.query.page != null) && !isNaN(req.query.page) ? req.query.page : 1;
          localData = {
            title: user.nick + "的关注",
            pageUser: user,
            isLoggedIn: false,
            page: page,
            userNav: 'following'
          };
          if (req.currentUser) {
            _currentUser = req.currentUser;
            return async.parallel({
              isFollowing: function(callback) {
                return db.follow.findOne({
                  from: _currentUser._id,
                  to: user._id
                }, function(err, follow) {
                  return callback(null, follow != null);
                });
              },
              users: function(callback) {
                var skip;
                skip = (page - 1) * 10;
                return db.follow.findItems({
                  from: user._id
                }, {
                  skip: skip,
                  limit: 10
                }, function(err, followings) {
                  return async.map(followings, function(item, cb) {
                    return db.user.findOne({
                      _id: item.to
                    }, function(err, user) {
                      return cb(err, user);
                    });
                  }, function(err, results) {
                    return callback(null, results);
                  });
                });
              }
            }, function(err, results) {
              if (err) {
                return next(err);
              } else {
                localData.isSelf = _currentUser.username === user.username;
                user.isFollowing = results.isFollowing;
                localData.users = results.users;
                localData.user = req.currentUser;
                localData.isLoggedIn = true;
                localData.uri = req.url;
                return res.render('follow', localData);
              }
            });
          } else {
            return res.render('follow', localData);
          }
        } else {
          return res.send(err);
        }
      });
    });
    app.get('/user/:username/follower', loadUser, function(req, res, next) {
      return db.user.findOne({
        username: req.params.username
      }, function(err, user) {
        var localData, page, _currentUser;
        if (err || !(user != null)) {
          err = err || '没有这个用户';
          return next(err);
        } else if (user) {
          page = (req.query.page != null) && !isNaN(req.query.page) ? req.query.page : 1;
          localData = {
            title: user.nick + "的粉丝",
            pageUser: user,
            isLoggedIn: false,
            page: page,
            userNav: 'follower'
          };
          if (req.currentUser) {
            _currentUser = req.currentUser;
            return async.parallel({
              isFollowing: function(callback) {
                return db.follow.findOne({
                  from: _currentUser._id,
                  to: user._id
                }, function(err, follow) {
                  return callback(null, follow != null);
                });
              },
              users: function(callback) {
                var skip;
                skip = (page - 1) * 10;
                return db.follow.findItems({
                  to: user._id
                }, {
                  skip: skip,
                  limit: 10
                }, function(err, followers) {
                  return async.map(followers, function(item, cb) {
                    return db.user.findOne({
                      _id: item.from
                    }, function(err, user) {
                      return cb(err, user);
                    });
                  }, function(err, results) {
                    return callback(null, results);
                  });
                });
              }
            }, function(err, results) {
              if (err) {
                return next(err);
              } else {
                localData.isSelf = _currentUser.username === user.username;
                user.isFollowing = results.isFollowing;
                localData.users = results.users;
                localData.user = req.currentUser;
                localData.isLoggedIn = true;
                localData.uri = req.url;
                return res.render('follow', localData);
              }
            });
          } else {
            return res.render('follow', localData);
          }
        } else {
          return res.send(err);
        }
      });
    });
    app.put('/follow/:id', loadUser, function(req, res, next) {
      var currentUser;
      if (req.currentUser) {
        currentUser = req.currentUser;
        return db.user.findById(req.params.id, function(err, user) {
          if (user) {
            return db.follow.insert({
              from: currentUser._id,
              to: user._id
            }, {
              safe: true
            }, function(err, replies) {
              if (err != null) {
                if (err.code === 11000) {
                  return res.send('success');
                } else {
                  return res.send(err);
                }
              } else {
                return async.parallel([
                  function(callback) {
                    return db.user.update({
                      _id: currentUser._id
                    }, {
                      $inc: {
                        num_following: 1
                      }
                    }, function(err, count) {
                      return callback(err, count);
                    });
                  }, function(callback) {
                    return db.user.update({
                      _id: user._id
                    }, {
                      $inc: {
                        num_follower: 1
                      }
                    }, function(err, count) {
                      return callback(err, count);
                    });
                  }
                ], function(err, results) {
                  if (err) {
                    return next;
                  } else {
                    return res.send('success');
                  }
                });
              }
            });
          } else {
            return res.send('user not found');
          }
        });
      } else {
        return res.send('error');
      }
    });
    app.put('/unfollow/:id', loadUser, function(req, res, next) {
      var currentUser;
      if (req.currentUser) {
        currentUser = req.currentUser;
        return db.user.findById(req.params.id, function(err, user) {
          if (user) {
            return db.follow.remove({
              from: currentUser._id,
              to: user._id
            }, function(err, follow) {
              if ((err != null)) {
                return next(err);
              } else {
                return async.parallel([
                  function(callback) {
                    return db.user.update({
                      _id: currentUser._id
                    }, {
                      $inc: {
                        num_following: -1
                      }
                    }, function(err, count) {
                      return callback(err, count);
                    });
                  }, function(callback) {
                    return db.user.update({
                      _id: user._id
                    }, {
                      $inc: {
                        num_follower: -1
                      }
                    }, function(err, count) {
                      return callback(err, count);
                    });
                  }
                ], function(err, results) {
                  if (err != null) {
                    return next(err);
                  } else {
                    return res.send('success');
                  }
                });
              }
            });
          } else {
            return res.send('error');
          }
        });
      } else {
        return res.send('error');
      }
    });
    app.post('/comment', loadUser, function(req, res, next) {
      var comment, _user;
      _user = req.currentUser;
      comment = {
        p: db.comment.id(req.body.id),
        body: req.body.body,
        time: req.body.time,
        date: new Date(),
        u: {
          _id: _user._id
        }
      };
      return db.comment.insert(comment, function(err, replies) {
        var date;
        if (err) {
          return next(err);
        } else {
          replies[0].u = _user;
          date = replies[0].date;
          replies[0].date = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() + ' ' + date.getHours() + ':' + date.getMinutes();
          return res.send(replies[0]);
        }
      });
    });
    app.del('/post/:id.:format?', loadUser, function(req, res, next) {
      var p_id;
      p_id = req.params.id;
      return async.parallel({
        post: function(cb) {
          return db.post.removeById(p_id, function(err) {
            return cb(err);
          });
        },
        comment: function(cb) {
          return db.comment.remove({
            p: db.comment.id(p_id)
          }, function(err) {
            return cb(err);
          });
        },
        userCount: function(cb) {
          return db.user.updateById(req.currentUser._id.toString(), {
            '$inc': {
              num_posts: -1
            }
          }, function(err) {
            return cb(err);
          });
        },
        audio: function(cb) {
          return audioFS.unlink(p_id, function(err) {
            return cb(err);
          });
        },
        waveform: function(cb) {
          return wfFS.unlink(p_id, function(err) {
            return cb(err);
          });
        },
        fav: function(cb) {
          return db.fav.findItems({
            p: db.fav.id(p_id)
          }, function(err, favs) {
            if (favs.length) {
              return async.forEach(favs, function(item, cb2) {
                return async.parallel({
                  fav: function(cb3) {
                    return db.fav.remove({
                      p: item.p
                    }, function(err) {
                      return cb3(err);
                    });
                  },
                  userCount: function(cb3) {
                    return db.user.update({
                      _id: item.u
                    }, {
                      $inc: {
                        num_fav: -1
                      }
                    }, function(err) {
                      return cb3(err);
                    });
                  }
                }, function(err, result) {
                  return cb2(err);
                });
              }, function(err) {
                return cb(err);
              });
            } else {
              return cb(null);
            }
          });
        }
      }, function(err, results) {
        if (err) {
          return next(err);
        } else {
          return res.send('1');
        }
      });
    });
    app.post('/post/fav/:id', loadUser, function(req, res, next) {
      return db.fav.insert({
        p: db.post.id(req.params.id),
        u: req.currentUser._id
      }, {
        safe: true
      }, function(err, f) {
        if (err) {
          if (err.code === 11000) {
            return res.send('1');
          } else {
            return next(err);
          }
        } else {
          return async.parallel([
            function(cb) {
              return db.post.updateById(req.params.id, {
                '$inc': {
                  num_fav: 1
                }
              }, function(err) {
                return cb(err);
              });
            }, function(cb) {
              return db.user.update({
                _id: req.currentUser._id
              }, {
                '$inc': {
                  num_fav: 1
                }
              }, function(err) {
                return cb(err);
              });
            }
          ], function(err, result) {
            if (err) {
              return next(err);
            } else {
              return res.send('1');
            }
          });
        }
      });
    });
    app.del('/post/fav/:id', loadUser, function(req, res, next) {
      var selector;
      selector = {
        p: db.post.id(req.params.id),
        u: req.currentUser._id
      };
      return db.fav.findOne(selector, function(err, f) {
        if (f) {
          return db.fav.remove(selector, function(err, result) {
            return async.parallel([
              function(cb) {
                return db.post.updateById(req.params.id, {
                  '$inc': {
                    num_fav: -1
                  }
                }, function(err) {
                  return cb(err);
                });
              }, function(cb) {
                return db.user.update({
                  _id: req.currentUser._id
                }, {
                  '$inc': {
                    num_fav: -1
                  }
                }, function(err) {
                  return cb(err);
                });
              }
            ], function(err, result) {
              if (err) {
                return next(err);
              } else {
                return res.send('1');
              }
            });
          });
        } else {
          return res.send('1');
        }
      });
    });
    app.get('/audio/:id.:format', function(req, res, next) {
      return audioFS.stream(req.params.id, function(err, stream) {
        if (err) {
          return next(err);
        } else {
          res.contentType('audio/' + req.params.format);
          return stream.pipe(res);
        }
      });
    });
    app.get('/waveform/:id', function(req, res, next) {
      return wfFS.stream(req.params.id, function(err, stream) {
        if (err) {
          return next(err);
        } else {
          res.contentType('audio/png');
          return stream.pipe(res);
        }
      });
    });
    app.get('/avatar/:id/:ver', function(req, res, next) {
      var size, _filename;
      size = req.query.size;
      if (size === '32' || size === '48' || size === '128') {
        _filename = req.params.id + '_' + size;
        return avatarFS.stream(_filename, function(err, stream) {
          if (err) {
            return next(err);
          } else {
            res.contentType('image/jpeg');
            return stream.pipe(res);
          }
        });
      } else {
        return res.end('size should be 32, 48, 128');
      }
    });
    return app.get('/android-client.apk', function(req, res, next) {
      res.contentType('application/vnd.android.package-archive');
      return res.sendfile('public/download/supersonic.apk');
    });
  };
  exports.route = route;
}).call(this);
