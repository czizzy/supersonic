$(function(){
	Backbone.emulateHTTP = true;
	_.templateSettings = {
	    interpolate : /\{\{(.+?)\}\}/g
	};
	var Post = Backbone.Model.extend({
		initialize: function(p){
			var model = this;
			model.id = model.get('_id');
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
		url: '/post'
	});
	var PostView = Backbone.View.extend({
		tagName: 'li',
		template: _.template($('#post-item-template').html()),
		events: {
			'click a.post-delete': 'remove',
			'click span.play': 'play',
			'click span.pause': 'pause',
			'click div.audio-full': 'setPosition'
		},
		initialize: function(){
			_.bindAll(this, 'unrender', 'remove');
			var _model = this.model, _view = this, _length = _model.get('time');
			_model.bind('remove', this.unrender);
			
			_model.addListener('whileplaying', function(audio){
				//console.log('sound '+audio.sID+' playing, '+audio.position+' of '+audio.duration);	
				var _progress = audio.position/_length*100;
				$(_view.el).find('p.progress').css('width', _progress+'%');
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
				console.log(this.model.url());
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
				username: this.model.get('user').username,
				usernick: this.model.get('user').nick,
				date: this.model.get('date')
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
			console.log(e);
			console.log($(e.currentTarget).offset());
			console.log($(e.currentTarget).width());
			var $div = $(e.currentTarget), position = (e.clientX-$div.offset().left) / $div.width();
			console.log(position, position*this.model.get('time'));
			this.model.get('audio').setPosition(position*this.model.get('time'));
		}
	});
	var PostListView = Backbone.View.extend({
		el: $('ul#posts'),
		tagName: 'ul',
		initialize: function(){
			// _.bindAll(this, 'removeItem');
			this.collection = new PostList();
			//this.collection.bind('destroy', this.removeItem);
			console.log('collectin', this.collection);
		},
		render: function(posts){
			var element = this.el, _view = this;
			_.each(posts, function(p) {
				var pModel = new Post(p);
				_view.collection.add(pModel);
				pModel.view = new PostView({ model: pModel });
				element.append(pModel.view.render().el);
			});
		}// ,
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
		});
	});

});

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