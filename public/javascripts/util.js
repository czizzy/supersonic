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
	},
	htmlspecialchars: function(string, quote_style, charset, double_encode) {
		if(!string){
			return '';
		}
		var optTemp = 0, i = 0, noquotes= false;
		if (typeof quote_style === 'undefined' || quote_style === null) {		quote_style = 2;
		}

		string = string.toString();
		if (double_encode !== false) { // Put this first to avoid double-encoding
			string = string.replace(/&/g, '&amp;');	}
		string = string.replace(/</g, '&lt;').replace(/>/g, '&gt;');
		
		var OPTS = {
			'ENT_NOQUOTES': 0,		'ENT_HTML_QUOTE_SINGLE' : 1,
			'ENT_HTML_QUOTE_DOUBLE' : 2,
			'ENT_COMPAT': 2,
			'ENT_QUOTES': 3,
			'ENT_IGNORE' : 4	};
		if (quote_style === 0) {
			noquotes = true;
		}
		if (typeof quote_style !== 'number') { // Allow for a single string or an array of string flags		quote_style = [].concat(quote_style);
			for (i=0; i < quote_style.length; i++) {
				// Resolve string input to bitwise e.g. 'PATHINFO_EXTENSION' becomes 4
				if (OPTS[quote_style[i]] === 0) {
					noquotes = true;			}
				else if (OPTS[quote_style[i]]) {
					optTemp = optTemp | OPTS[quote_style[i]];
				}
			}		quote_style = optTemp;
		}
		if (quote_style & OPTS.ENT_HTML_QUOTE_SINGLE) {
			string = string.replace(/'/g, '&#039;');
		}
		if (!noquotes) {
			string = string.replace(/"/g, '&quot;');
		}

		return string;
	}
};