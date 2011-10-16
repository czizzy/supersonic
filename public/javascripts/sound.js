soundManager.url = '/swf/';
console.log(soundManager);
// disable debug mode after development/testing..
// soundManager.debugMode = false;

soundManager.onready(function(){

  // SM2 has loaded - now you can create and play sounds!

  var mySound = soundManager.createSound({
    id: 'sound',
    url: '/audio/4e96f53eb6728fc96b000001.ogg',
	//url: '/_mp3/mak.mp3',
    // onload: myOnloadHandler,
    // other options here..
	autoLoad: true,
    autoPlay: false,
  	onload: function() {
    	alert('The sound '+this.sID+' loaded!');
  	},
  	volume: 50
  });

  mySound.play();

});