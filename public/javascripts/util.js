var Util = {
	addVerify: function (id, helpTip, tests, maxLen, maxTip, minLen, minTip) {
		function showText(jqObj, className, text)
		{
			if (className == "col-help") {
				jqObj.removeClass("reg-input-error").next().removeClass().addClass(className).html(text).fadeIn(200);
				jqObj.next().next().hide();
			} else
				jqObj.addClass("reg-input-error").next().removeClass().addClass(className).html(text).fadeIn(200);
		}

		var isInit = true;
		if ($("#" + id).next().html() && $("#" + id).next().html().length > 0) $("#" + id).focus().addClass("reg-input-error").next().addClass("col-error");
		isInit = false;
		$("#" + id).focus(function(){
			if (!isInit) showText($(this), "col-help", helpTip);
		}).blur(function(){

			var error = false;
			if (!error && minLen >= 0) {
				if ($.trim($(this).val()).length <= minLen) {
					error = true;
					showText($(this), "col-error", minTip);
				}
			}
			if (!error && maxLen >= 0) {
				if ($.trim($(this).val().length) > maxLen) {
					error = true;
					showText($(this), "col-error", maxTip);
				}
			}
			if (!error) {
				for(var i = 0; i<tests.length; i++){
					if (!tests[i].testFunc($(this).val())) {
						error = true;
						showText($(this), "col-error", tests[i].errorTip);
						break;
					}
					if(tests[i].testFunc($(this).val()) == 'wait') {
						error = 'wait';
						break;
					}
				}
			}
			

			if (!error || error == 'wait') $(this).next().fadeOut(200, function(){$(this).removeClass();});
		});
	}
};