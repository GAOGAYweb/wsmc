// Generated by CoffeeScript 1.6.3
(function() {
  var WebSocketServer, ids, mc, sids, states, wss;

  mc = require('minecraft-protocol');

  WebSocketServer = (require('ws')).Server;

  states = mc.protocol.states;

  ids = mc.protocol.packetIDs.play.toClient;

  sids = mc.protocol.packetIDs.play.toServer;

  wss = new WebSocketServer({
    port: 1234
  });

  wss.on('connection', function(ws) {
    var client;
    ws.send(JSON.stringify({
      name: 'wsmc-welcome'
    }));
    client = mc.createClient({
      host: 'localhost',
      port: 25565,
      username: 'webuser',
      password: null
    });
    ws.on('close', function() {
      console.log('WebSocket disconnected, closing MC');
      return client.socket.end();
    });
    client.on('packet', function(p) {
      var name, _ref;
      name = (_ref = mc.protocol.packetNames.play.toClient[p.id]) != null ? _ref : pi.id;
      return ws.send(JSON.stringify([name, p]));
    });
    client.on('connect', function() {
      return console.log('Successfully connected to MC');
    });
    client.on([states.PLAY, ids.chat], function(p) {});
    client.on([states.PLAY, ids.disconnect], function(p) {
      return console.log("Kicked for " + p.reason);
    });
    return ws.on('message', function(raw) {
      var array, e, id, payload;
      console.log("websocket received: " + raw);
      try {
        array = JSON.parse(raw);
      } catch (_error) {
        e = _error;
        console.log("bad message from websocket client, invalid JSON: " + raw);
        return;
      }
      if (array.length !== 2) {
        console.log("bad message from websocket client, invalid format: " + raw);
        return;
      }
      id = array[0];
      if (typeof id === 'string') {
        id = sids[id];
      }
      if (id == null) {
        console.log("bad message from websocket client, no such id '" + array[0] + "': " + raw);
        return;
      }
      payload = array[1];
      return client.write(id, payload);
    });
  });

}).call(this);