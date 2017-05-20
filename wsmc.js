'use strict';

var mcversion = require('./mcversion.js');
var minecraft_protocol = require('minecraft-protocol/src');
var autoVersionForge = require('minecraft-protocol-forge').autoVersionForge;
var minecraft_data = require('minecraft-data')(mcversion);
var protodef = require('protodef');
var readVarInt = protodef.types.varint[0];
var writeVarInt = protodef.types.varint[1];
var sizeOfVarInt = protodef.types.varint[2];
var hex = require('hex');
var WebSocketServer = (require('ws')).Server;
var websocket_stream = require('websocket-stream');
var argv = (require('optimist'))
  .default('wshost', '0.0.0.0')
  .default('wsport', 24444)
  .default('mchost', 'localhost')
  .default('mcport', 25565)
  .default('prefix', 'webuser-')
  .argv;

var PACKET_DEBUG = process.env.NODE_DEBUG && /wsmc/.test(process.env.NODE_DEBUG);
var FIXED_MC_VERSION = false; // either a version string, or false to auto-detect

console.log('WS('+argv.wshost+':'+argv.wsport+') <--> MC('+argv.mchost+':'+argv.mcport+')');

// var ids = minecraft_data.protocol.states.play.toClient;
// var sids = minecraft_data.protocol.states.play.toServer;


var userIndex = 1;

var wss = new WebSocketServer({
  host: argv.wshost,
  port: argv.wsport});

var EMPTY_BUFFER = new Buffer(0);

wss.on('connection', function(new_websocket_connection) {
  console.log("wss connection");
  var ws = websocket_stream(new_websocket_connection);
  var loggingIn = true;

  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
  });

  //ws.write('OK', {binary: true});

  var mc = minecraft_protocol.createClient({
    version: FIXED_MC_VERSION,
    host: argv.mchost,
    port: argv.mcport,
    username: argv.prefix + userIndex,
    password: null});
  autoVersionForge(mc);

  userIndex += 1;

  ws.on('close', function() {
    console.log('WebSocket disconnected, closing MC');
    if (mc.socket) mc.socket.end();
  });

  ws.on('error', function(err) {
    console.log('WebSocket error: ',err);
    mc.socket.end();
  });

  var compressionThreshold = -2;

  mc.on('set_compression', function(packet) {
    console.log('set_compression', packet);
    compressionThreshold = packet.threshold;
  });
  mc.on('compress', function(packet) {
    console.log('compress', packet);
    compressionThreshold = packet.threshold;
  });


  mc.on('raw', function(buffer, packet_state) {
    var state = packet_state.state;
    if (PACKET_DEBUG) {
      console.log('mc received '+buffer.length+' bytes');
      hex(buffer);
    }

    if (state !== 'play' && state !== 'login') {
      console.log('Skipping state '+state+' packet: ',buffer);
      console.log(state);
      return;
    }

    // Packet header fields

    var length = buffer.length;

    var isCompressPacket = state === 'login' && buffer[0] == 0x03;
    // The 'compress' packet itself is not compressed, but the node-minecraft-protocol event handler
    // for it is called before the 'raw' handler (us), so we have to specifically exclude it

    var uncompressedDataLengthField;
    if (compressionThreshold > -2 && !isCompressPacket) {
      // After set_compression, includes 'uncompressed' length (0 for no compression)
      // TODO: compress? or can we get really-raw maybe-compressed data? to avoid double uncomp/recomp
      var uncompressedDataLength = 0;
      uncompressedDataLengthField = new Buffer(sizeOfVarInt(uncompressedDataLength));
      writeVarInt(uncompressedDataLength, uncompressedDataLengthField, 0);
      length += uncompressedDataLengthField.length;
    } else {
      uncompressedDataLengthField = EMPTY_BUFFER;
    }

    // Prepend varint length prefix
    var lengthField = new Buffer(sizeOfVarInt(length));
    writeVarInt(length, lengthField, 0);

    var lengthPrefixedBuffer = Buffer.concat([lengthField, uncompressedDataLengthField, buffer]);
    if (PACKET_DEBUG) {
      console.log('lengthField=',lengthField);
      console.log('writing to ws '+lengthPrefixedBuffer.length+' bytes');
      hex(lengthPrefixedBuffer);
    }
    ws.write(lengthPrefixedBuffer);
    //ws.write(buffer);
  });

  mc.on('connect', function() {
    console.log('Successfully connected to MC');
  });

  mc.on('error', function(err) {
    console.log('Received error from MC:',err);
  });

  //mc.once(['login', 'success'], function(p) {
  mc.once('success', function(p) { // note: part of login phase
    // after login completes
    // TODO: fix updating
  });

  ws.on('data', function(raw) {
    if (PACKET_DEBUG) {
      console.log('websocket received '+raw.length+' bytes');
      hex(raw);
    }

    if (loggingIn) {
      // first packet username
      console.log('WS requested username: '+raw); // TODO: use it
      loggingIn = false;
      return;
    }

    //console.log "websocket received '+raw.length+' bytes: '+JSON.stringify(raw));

    var uncompressedLengthFieldSize;
    if (compressionThreshold > -2) {
      var uncompressedLengthField = readVarInt(raw, 0);
      if (!uncompressedLengthField) {
        throw new Error('Failed to parse varint uncompressed length in raw buffer from ws:', raw);
      }

      uncompressedLengthFieldSize = uncompressedLengthField.size; // the compressed packet format uncompressed data length
    } else {
      uncompressedLengthFieldSize = 0;
    }

    var rawWithoutLength = raw.slice(uncompressedLengthFieldSize);

    if (PACKET_DEBUG) {
      console.log('forwarding ws -> mc: '+rawWithoutLength.length+' bytes');
      hex(rawWithoutLength);
    }
    mc.writeRaw(rawWithoutLength);
  });
});

