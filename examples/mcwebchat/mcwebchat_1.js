var mineflayer = require('../../mineflayer-ws');

var username;
username = 'mcwebchatuserX';

var bot = mineflayer.createBot({
  username: username
});

// parsed chat event is available, but raw message has more information
bot.on('chat', function(username, message) {
  console.log('<'+username+'> '+message);
});

bot.on('message', function(message) {
  console.log(message.json); // TODO: also decode color codes
});

bot.on('error', function(exception) {
  console.log(exception);
  if (exception.currentTarget)
    console.log('WebSocket error connecting to ' + exception.currentTarget.url);
  else
    console.log('WebSocket error: ' + exception);
});

bot.on('close', function() {
  console.log('WebSocket closed');
});
