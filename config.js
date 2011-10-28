(function() {
  exports.config = {
    env: 'development',
    mongo: {
      dbname: 'supersonic',
      host: '127.0.0.1',
      account: '',
      password: '',
      port: 27017
    },
    port: 3000
  };
}).call(this);
