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
    FlashMessage.prototype.icon = function() {
      switch (this.type) {
        case 'info':
          return 'ui-icon-info';
        default:
          return 'ui-icon-alert';
      }
    };
    FlashMessage.prototype.stateClass = function() {
      switch (this.type) {
        case 'info':
          return 'ui-state-highlight';
        default:
          return 'ui-state-error';
      }
    };
    FlashMessage.prototype.toHTML = function() {
      return '<div class="ui-widget flash">' + '<div class="' + this.stateClass() + ' ui-corner-all">' + '<p><span class="ui-icon ' + this.icon() + '"></span>' + this.messages.join(', ') + '</p>' + '</div>';
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
