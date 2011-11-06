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

    stateClass: ->
        switch @type
            when 'info' then 'success'
            else 'error'
    toHTML: ->
          '<div class="alert-box ' + @stateClass() + '">' +
          @messages.join(', ') +
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
