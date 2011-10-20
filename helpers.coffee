exports.helpers = {
    nameAndVersion: (name, version) ->
        name + ' v' + version;

    appName: 'Nodepad'
    version: '0.1'
}

class FlashMessage
    constructor: (type, messages) ->
        @type = type
        @messages = messages

    icon: ->
        switch @type
            when 'info' then 'ui-icon-info'
            else 'ui-icon-alert'
    stateClass: ->
        switch @type
            when 'info' then 'ui-state-highlight'
            else 'ui-state-error'
    toHTML: ->
         '<div class="ui-widget flash">' +
          '<div class="' + @stateClass() + ' ui-corner-all">' +
          '<p><span class="ui-icon ' + @icon() + '"></span>' + @messages.join(', ') + '</p>' +
          '</div>'

exports.dynamicHelpers = {
  flashMessages: (req, res) ->
      html = ''
      ['error', 'info'].forEach (type) ->
          messages = req.flash type
          if (messages.length > 0)
              html += new FlashMessage(type, messages).toHTML();

      html
}
