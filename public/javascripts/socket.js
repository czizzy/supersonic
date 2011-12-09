var socket = io.connect('/');
socket.on('comment', function(comment){
    var $notificationBar = $('#notification-bar');
    if($notificationBar.length == 0){
        $('#header-content').append('<div id="notification-bar" class="alert-box success">您有<span class="num">0</span>条新评论</div>');
        $notificationBar = $('#notification-bar');
    }
    var notificationNum = parseInt($notificationBar.children('span.num').text());
    $notificationBar.children('span.num').text(++notificationNum);
});
