(function() {
  var FlashMessage;
  exports.helpers = {
    nameAndVersion: function(name, version) {
      return name + ' v' + version;
    },
    appName: 'Nodepad',
    version: '0.1'
  };
  FlashMessage = (function() {
    function FlashMessage(type, messages) {
      this.type = type;
      this.messages = messages;
    }
    FlashMessage.prototype.stateClass = function() {
      switch (this.type) {
        case 'info':
          return 'success';
        default:
          return 'error';
      }
    };
    FlashMessage.prototype.toHTML = function() {
      return '<div class="alert-box ' + this.stateClass() + '">' + this.messages.join(', ') + '</div>';
    };
    return FlashMessage;
  })();
  exports.dynamicHelpers = {
    flashMessages: function(req, res) {
      var html;
      html = '';
      ['error', 'info'].forEach(function(type) {
        var messages;
        messages = req.flash(type);
        if (messages.length > 0) {
          return html += new FlashMessage(type, messages).toHTML();
        }
      });
      return html;
    }
  };
}).call(this);
