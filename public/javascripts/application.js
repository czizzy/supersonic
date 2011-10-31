$(function(){
	var opts = {
	  lines: 12, // The number of lines to draw
	  length: 7, // The length of each line
	  width: 4, // The line thickness
	  radius: 10, // The radius of the inner circle
	  color: '#000', // #rgb or #rrggbb
	  speed: 1, // Rounds per second
	  trail: 60, // Afterglow percentage
	  shadow: false // Whether to render a shadow
	};
	var target = document.getElementById('posts-content');
	var spinner = new Spinner(opts).spin(target);
	Backbone.emulateHTTP = true;
	// _.templateSettings = {
	//     interpolate : /\{\{(.+?)\}\}/g
	// };
	var Post = Backbone.Model.extend({
		initialize: function(p){
			var model = this;
			model.id = model.get('_id');
			model.url = '/post/'+model.id;
			model.set({audio: soundManager.createSound({
				id: 'a_'+model.get('_id'),
				url: '/audio/'+model.get('_id')+'.'+model.get('format'),
				// other options here..
				autoLoad: false,
				autoPlay: false,
				onload: function() {
					if( this.readyState === 3 ) { 
						console.log(this,this.durationEstimate);
						this.onposition(this.duration - 500, function() {
						    console.log('the sound ' + this.sID + ' is now at position ' + this.position);
					});
					}

				},
				onplay: function(a,b) {
					console.log('play');
				},
				onfinish: function(){
					console.log('finish');
					var listeners = model.get('listeners');
					if(listeners.onfinish){
						_.each(listeners.onfinish, function(func){
							func(this);
						}, this);
					}
				},
				onstop: function(){
					
				},
				whileloading: function(){
					console.log('sound '+this.sID+' loading, '+this.durationEstimate);
				},
				whileplaying: function(){
					var listeners = model.get('listeners');
					if(listeners.whileplaying){
						_.each(listeners.whileplaying, function(func){
							func(this);
						}, this);
					}
				},
				volume: 80
			})});
			model.set({'listeners': {}});
			model.set({'showSec': null});
			console.log('model', this);
		},
		addListener: function(method, func){
			var listeners = this.get('listeners');
			if(!listeners[method]){
				listeners[method] = [];
			}
			listeners[method].push(func);
		}
	});
	var PostList = Backbone.Collection.extend({
		model:Post,
		url: '/feeds'
	});
	var PostView = Backbone.View.extend({
		tagName: 'li',
		template: _.template($('#post-item-template').html()),
		events: {
			'click a.post-delete': 'remove',
			'click span.play': 'play',
			'click span.pause': 'pause',
			'click div.audio-full': 'setPosition',
			'click div.comment-bar': 'comment'
		},
		initialize: function(){
			_.bindAll(this, 'unrender', 'remove');
			var _model = this.model, _view = this, _length = _model.get('time');
			_model.bind('remove', this.unrender);
			_model.addListener('whileplaying', function(audio){
				console.log('sound '+audio.sID+' playing, '+audio.position+' of '+audio.duration);	
				var _progress = audio.position/_length*100;
				$(_view.el).find('p.progress').css('width', _progress+'%');
				var nowSec = parseInt(audio.position/1000);
				var showComments = _.select(_model.get('comments'), function(comment){
					return parseInt(comment.time/1000) == nowSec;
				});
				if(showComments.length){
					if(_model.get('showSec') !== nowSec){
						var $bar = $(_view.el).find('div.audio-full');
						_model.set({showSec: nowSec});
						var commentsStr = '';
						_.each(showComments, function(item, index, list){
							commentsStr += '<div>';
							commentsStr += ('<p>'+Util.htmlspecialchars(item.body)+'</p>');
							commentsStr += ('<p>'+Util.htmlspecialchars(item.u.nick)+'</p>');
							commentsStr += ('<p>'+item.date+'</p>');
							commentsStr += '</div>';
						});
						var $dialog = $('<div class="comment-show-dialog">'+commentsStr+'<a class="cancel" href="javascript:void(0);">cancel</a></p></div>'), removeInt;
						$dialog.css({
							"top":($bar.height()+7)+"px",
							"left":_progress+"%"
						});
						$dialog.click(function(e){
							e.stopPropagation();
						});
						$dialog.delegate('a.cancel', 'click', function(){
							clearTimeout(removeInt);
							removeInt = null;
							$dialog.remove();
						});
						removeInt = setTimeout(function(){
							$dialog.remove();
						}, 1000);
						$bar.append($dialog);
						console.log($dialog);
						console.log($bar);
					}
				} else if(_model.get('showSec') !== null){
					_model.set({showSec: null});
				}
			});
			_model.addListener('onfinish', function(audio){
				//console.log('sound '+audio.sID+' playing, '+audio.position+' of '+audio.duration);	
				var _progress = audio.position/_length*100;
				$(_view.el).find('span.pause').toggleClass('pause play');
			});
		},
		remove: function(e){
			e.preventDefault();
			var _view = this;
			if (confirm('Are you sure you want to delete that item?') ){
				var $element = $(this.el);
				console.log(this.model.url);
				this.model.destroy({success: function(model, res){
					if(res == '1'){
						_view.unrender();
					}
				}});
			}
		},
		render: function() {
			$(this.el).html(this.template({
				id: this.model.get('_id'),
				format: this.model.get('format'),
				text: this.model.get('text'),
				user: this.model.get('user'),
				date: this.model.get('date'),
				comments: this.model.get('comments'),
				time: this.model.get('time')
			}));
			return this;
		},
		unrender: function(){
			$(this.el).fadeOut(function(){
				$(this).remove();
			});
		},
		play: function(e){
			console.log('event', e);
			$(e.currentTarget).toggleClass('play pause');
			this.model.get('audio').play();
		},
		pause: function(e){
			$(e.currentTarget).toggleClass('play pause');
			this.model.get('audio').pause();
		},
		setPosition: function(e){
			var $div = $(e.currentTarget), position = (e.clientX-$div.offset().left) / $div.width();
			console.log(position, position*this.model.get('time'));
			this.model.get('audio').setPosition(position*this.model.get('time'));
		},
		comment: function(e){
			console.log(e.currentTarget);
			var $bar = $(e.currentTarget), offset = $bar.offset() , position = (e.clientX-offset.left) / $bar.width();
			var model = this.model, fullTime = model.get('time'), time = parseInt(position*fullTime), timeStr = second2Time(time/1000);
			$bar.find('div.comment-dialog').remove();
			var $dialog = $('<div class="comment-dialog"><p>@' + timeStr + '</p><textarea></textarea><p><input type="button" value="submit" class="submit" data-id="'+model.get('_id')+'"/><a class="cancel" href="javascript:void(0);">cancel</a></p></div>');
			$dialog.css({
				"top":($bar.height()+7)+"px",
				"left":(e.clientX-offset.left)+"px"
			});
			$dialog.click(function(e){
				e.stopPropagation();
			});
			$dialog.delegate('a.cancel', 'click', function(){
				$dialog.remove();
			});
			$dialog.delegate('input.submit', 'click', function(){
				var $this = $(this);
				$.post('/comment', {id: $this.attr('data-id'), body: $dialog.find('textarea').val(), time: time}, function(res){
					console.log(res);
					model.get('comments').push(res);		
					$bar.find('ul').append('<li data-id="'+res._id+'" style="left:' + (res.time/fullTime*100) + '%" data-body="'+Util.htmlspecialchars(res.body)+'"><img src="/avatar/'+res.u._id+'?size=32" width="20" height="20" /></li>');
				});
				$dialog.remove();
			});
			$bar.append($dialog);
		}
	});
	var PostListView = Backbone.View.extend({
		el: $('ul#posts'),
		tagName: 'ul',
		events: {
			'click #feed-more a': 'getMore'
		},
		initialize: function(){
			//_.bindAll(this, 'render');
			this.collection = new PostList();
			//this.collection.bind('destroy', this.removeItem);
			console.log('collectin', this.collection);
		},
		render: function(posts){
			var element = this.el, _view = this;
			element.find('li#feed-more').remove();
			_.each(posts.items, function(p) {
				console.log('p', p);
				var pModel = new Post(p);
				_view.collection.add(pModel);
				pModel.view = new PostView({ model: pModel });
				element.append(pModel.view.render().el);
			});
			_view.collection.hasMore = posts.hasMore;
			if(posts.hasMore){
				_view.collection.lastDt = posts.items[9].date;
				element.append('<li id="feed-more"><a href="javascript:void(0)">更多动态</a></li>');
			}
		},
		getMore: function(){
			var _view = this;
			_view.collection.fetch({data:{dt:this.collection.lastDt}, success:function(collection, response){
				console.log(collection,response);
				_view.render(response);
			}});
			console.log(this.collection.lastDt);
		}//,
		// removeItem: function(){
		// 	console.log('remove', this.collection);
		// }
	});
	$.getScript("/javascripts/soundmanager2.js", function() {
		soundManager.url = '/swf/';
		// disable debug mode after development/testing..
		// soundManager.debugMode = false;
		soundManager.onready(function(){
			var postListView = new PostListView();
			postListView.render(postsJSON);
			spinner.stop();
		});
	});

});

function second2Time(time){
	var hours = parseInt(time/3600), timeInHour = parseInt(time%3600), minutes = parseInt(timeInHour/60), seconds = parseInt(timeInHour%60);
	var timeStr = '';
	if(hours) timeStr += (hours + ':');
	timeStr += (minutes + ':');
	timeStr += seconds;
	return timeStr;
}

// $.getScript("/javascripts/soundmanager2.js", function(data, status) {
// 		//console.log(data, status);
// 		soundManager.url = '/swf/';
// 		console.log(soundManager);
// 		// disable debug mode after development/testing..
// 		// soundManager.debugMode = false;
// 		soundManager.onready(function(){
// 			console.log(ready);
// 		});
// 	});