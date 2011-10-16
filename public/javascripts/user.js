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
				console.log('result',res);
				$link.toggleClass('follow unfollow');
				$link.removeClass('handling');
				if($link.text() == 'follow') $link.text('unfollow');
				else $link.text('follow');
			});
		}
		return false;	
	});
});