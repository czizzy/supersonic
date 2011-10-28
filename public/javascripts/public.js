$(function(){
	Util.addVerify("username", "请输入您的用户名", [], -1, "", 0, "用户名不能为空");
	Util.addVerify("password", "请输入密码", [], -1, "", 5, "密码不能少于六位");
	Util.addVerify("confirm", "请确认您的密码", [{'testFunc':function(val){
		val = $.trim(val);
		return val === $.trim($('#password').val());
	},  'errorTip':"确认密码输入错误，请再检查一下"}], -1, "", 0, "确认密码不能为空");
	Util.addVerify("email", "请输入您的昵称", [{'testFunc':function(val){
		val = $.trim(val);
		if (val == "") return true;
		var teststr = /^[\w\.\-\+]+@([\w\-]+\.)+[a-z]{2,4}$/;
		return teststr.test(val);
	},  'errorTip':"Email输入错误，请再检查一下"}], -1, "", 0, "Email不能为空");
    Util.addVerify("nick", "请输入您的邮箱地址", [], 6, "昵称太长", -1, "");
	$(".verify-form").submit(function(){
		if ($(".col-error").length > 0) {
			$(".col-error").fadeOut(200, function(){$(this).fadeIn(200)}).parent().fadeOut(200, function(){$(this).fadeIn(200)});
			return false;
		}
	});

	// $('#container').delegate('#feed-more a', 'click', function(){
	// 	var $this = $(this);
	// 	$.get('/feeds?dt='+$(this).attr('data-dt'), function(res){
			
	// 	});
	// });
});