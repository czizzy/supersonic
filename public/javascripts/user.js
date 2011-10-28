$(function(){
	$('#container').delegate('a.#follow', 'click', function(){
		var $link = $(this), url;
		if(!$link.hasClass('handling')){
			$link.addClass('handling');
			if($link.hasClass('follow')){
				url = '/follow/';
			} else {
				url = '/unfollow/';
			}
			$.post(url+$link.attr('data-id'), {_method:'put'}, function(res){
				$link.toggleClass('follow unfollow');
				$link.removeClass('handling');
				if($link.text() == '关注') $link.text('取消关注');
				else $link.text('关注');
			});
		}
		return false;	
	});
	$('#container').delegate('#user-list a.button', 'click', function(){
		var $link = $(this), url;
		if(!$link.hasClass('handling')){
			$link.addClass('handling');
			url = '/unfollow/';
			$.post(url+$link.attr('data-id'), {_method:'put'}, function(res){
				$link.removeClass('handling');
				$link.parent().fadeOut(function(){});
			});
		}
		return false;	
	});
});