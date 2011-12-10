(function() {
  exports.config = {
    env: 'production',
    mongo: {
      dbname: 'supersonic',
      host: '127.0.0.1',
      account: '',
      password: '',
      port: 27017
    },
    port: 80
  };
}).call(this);
