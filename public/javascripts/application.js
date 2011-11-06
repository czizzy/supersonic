$(function(){
	var spinnerOpts = {
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
	var spinner = new Spinner(spinnerOpts).spin(target);
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
				},
				onplay: function(a,b) {
				},
				onfinish: function(){
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
				},
				whileplaying: function(){
					var listeners = model.get('listeners');
					if(listeners.whileplaying){
						_.each(listeners.whileplaying, function(func){
							func(this);
						}, this);
					}
				},
				volume: 100
			})});
			model.set({'listeners': {}});
			model.set({'showSec': null});
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
			'click div.audio': 'setPosition',
			'click div.comment-bar': 'comment',
			'click div.comment-bar li': 'showComment',
			'click span.fav': 'addFav',
			'click span.unfav': 'removeFav',
			'mousemove div.audio': 'hoverAudio',
			'mouseleave div.audio': 'outAudio'
		},
		initialize: function(){
			_.bindAll(this, 'unrender', 'remove');
			var _model = this.model, _view = this, _length = _model.get('time');
			_model.bind('remove', this.unrender);
			_model.addListener('whileplaying', function(audio){
				var _progress = audio.position/_length*100, nowSec = parseInt(audio.position/1000);
				var showComments = _.select(_model.get('comments'), function(comment){
					return parseInt(comment.time/1000) == nowSec;
				});
				$(_view.el).find('div.progress').css('width', _progress+'%');
				if(showComments.length){
					if(_model.get('showSec') !== nowSec){
						var $bar = $(_view.el).find('div.audio-full');
						_model.set({showSec: nowSec});
						showComments[0].view.ShowBubblePopup();
						setTimeout(function(){
							showComments[0].view.HideBubblePopup();
						}, 2000);
					}
				} else if(_model.get('showSec') !== null){
					_model.set({showSec: null});
				}
			});
			_model.addListener('onfinish', function(audio){
				var _progress = audio.position/_length*100;
				$(_view.el).find('span.pause').toggleClass('pause play');
			});
		},
		remove: function(e){
			e.preventDefault();
			var _view = this;
			if (confirm('确定要删除吗？') ){
				var $element = $(this.el);
				this.model.destroy({success: function(model, res){
					if(res == '1'){
						_view.unrender();
					}
				}});
			}
		},
		render: function() {
			var $el = $(this.el), _model = this.model;
			$el.html(this.template({
				id: _model.get('_id'),
				format: _model.get('format'),
				text: _model.get('text'),
				user: _model.get('user'),
				date: _model.get('date'),
				comments: _model.get('comments'),
				time: second2Time(_model.get('time')/1000),
				numFav: _model.get('num_fav')?_model.get('num_fav'):'',
				isFav: _model.get('isFav')
			}));
			var $commentList = $('div.comment-bar ul', $el);
			_.each(_model.get('comments'), function(comment, index, list){	
				var avatar = comment.u.avatar?comment.u.avatar:'/images/avatar-default-32.png';
				var $commentItem = $('<li style="left:'+(comment.time/_model.get('time')*100)+'%"><img src="'+avatar+'?size=32" height="18" width="18"/></li>'); 
				$commentList.append($commentItem);
				comment.view = $commentItem;
				var commentStr = '<div>';
				commentStr += ('<div>'+Util.htmlspecialchars(comment.u.nick)+'@'+second2Time(comment.time/1000)+'</div>');
				commentStr += ('<div>'+Util.htmlspecialchars(comment.body)+'</div>');
				commentStr += ('<div>'+comment.date+'</div>');
				commentStr += '</div>';
				$commentItem.CreateBubblePopup({position:'top', align:'center',innerHtml:commentStr,themeName: 'all-black', themePath: '/images/jquerybubblepopup-theme', themeMargins: {total:'0', difference:'0'}});
			});
			return this;
		},
		unrender: function(){
			$(this.el).fadeOut(function(){
				$(this).remove();
			});
		},
		play: function(e){
			$(e.currentTarget).toggleClass('play pause');
			this.model.get('audio').play();
		},
		pause: function(e){
			$(e.currentTarget).toggleClass('play pause');
			this.model.get('audio').pause();
		},
		hoverAudio: function(e){
			var $div = $(e.currentTarget), position = e.clientX-$div.offset().left, $bar = $div.find('div.bar');
			$bar.css({
				"display":"block",
				"left":position+"px"
			});
			
		},
		outAudio: function(e){
			var $div = $(e.currentTarget), $bar = $div.find('div.bar');
			$bar.hide();
		},
		setPosition: function(e){
			var $div = $(e.currentTarget), position = (e.clientX-$div.offset().left) / $div.width();
			this.model.get('audio').setPosition(position*this.model.get('time'));
		},
		addFav: function(e){
			var $target = $(e.currentTarget), count = $target.text();
			$.post('/post/fav/'+this.model.get('_id'), function(res){
				$target.toggleClass('fav unfav');
				$target.text(++count);
				$target.attr('title', '取消收藏');
			});
		},
		removeFav: function(e){
			var $target = $(e.currentTarget), count = $target.text();
			$.post('/post/fav/'+this.model.get('_id'), {_method: 'delete'}, function(res){
				$target.toggleClass('fav unfav');
				$target.text((--count)?count:'');
				$target.attr('title', '收藏');
			});
		},
		showComment: function(e){
			e.stopPropagation();
		},
		comment: function(e){
			var $bar = $(e.currentTarget), offset = $bar.offset() , position = (e.clientX-offset.left) / $bar.width(),  model = this.model, fullTime = model.get('time'), time = parseInt(position*fullTime), timeStr = second2Time(time/1000);
			$bar.find('div.comment-dialog').remove();
			var $dialog = $('<div class="comment-dialog"><div>@' + timeStr + '</div><div><textarea></textarea></div><div><a class="cancel button small nice" href="javascript:void(0);">取消</a><a href="javascript:void(0);" class="button small red nice submit" data-id="'+model.get('_id')+'">评论</a><img class="tail" src="/images/jquerybubblepopup-theme/all-black/tail-bottom.png" /></div></div>');
			$dialog.css({
				"top":"-135px",
				"left":(e.clientX-offset.left-24)+"px"
			});
			$dialog.click(function(e){
				e.stopPropagation();
			});
			$dialog.delegate('a.cancel', 'click', function(){
				$dialog.remove();
			});
			$dialog.delegate('a.submit', 'click', function(){
				var $this = $(this);
				$.post('/comment', {id: $this.attr('data-id'), body: $dialog.find('textarea').val(), time: time}, function(res){
					var comment = res, avatar = comment.u.avatar?comment.u.avatar:'/images/avatar-default-32.png', $commentItem = $('<li style="left:'+(comment.time/model.get('time')*100)+'%"><img src="'+avatar+'?size=32" height="18" width="18"/></li>'), commentStr = '<div>';
					model.get('comments').push(comment);
					$bar.find('ul').append($commentItem);
					comment.view = $commentItem;

                    commentStr += ('<div>'+Util.htmlspecialchars(comment.u.nick)+'@'+second2Time(comment.time/1000)+'</div>');
					commentStr += ('<div>'+Util.htmlspecialchars(comment.body)+'</div>');
					commentStr += ('<div>'+comment.date+'</div>');
					commentStr += '</div>';
					$commentItem.CreateBubblePopup({position:'top', align:'center',innerHtml:commentStr,themeName: 'all-black', themePath: '/images/jquerybubblepopup-theme', themeMargins: {total:'0', difference:'0'}});		
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
		},
		render: function(posts){
			var element = this.el, _view = this;
			element.find('li#feed-more').remove();
			_.each(posts.items, function(p) {
				var pModel = new Post(p);
				_view.collection.add(pModel);
				pModel.view = new PostView({ model: pModel });
				element.append(pModel.view.render().el);
			});
			_view.collection.hasMore = posts.hasMore;
			if(posts.hasMore){
				_view.collection.lastDt = posts.items[9].date;
				element.append('<li id="feed-more"><a class="button more" href="javascript:void(0)">更多动态</a></li>');
			}
		},
		getMore: function(){
			var _view = this;
			_view.collection.fetch({data:{dt:this.collection.lastDt}, success:function(collection, response){
				_view.render(response);
			}});
		}
	});
	//$.getScript("/javascripts/soundmanager2.js", function() {
		soundManager.url = '/swf/';
		// disable debug mode after development/testing..
		soundManager.debugMode = false;
		soundManager.useHighPerformance = false;
		soundManager.onready(function(){
			var postListView = new PostListView();
			postListView.render(postsJSON);
			spinner.stop();
			$('.pagination').show();
		});
	//});

});

function second2Time(time){
	var hours = parseInt(time/3600), timeInHour = parseInt(time%3600), minutes = parseInt(timeInHour/60), seconds = parseInt(timeInHour%60);
	var timeStr = '';
	if(hours) timeStr += (hours + ':');
	timeStr += (minutes + ':');
	timeStr += seconds;
	return timeStr;
}
