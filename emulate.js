const debug = require('debug')('emulate')

var myArgs = process.argv.slice(2);
const emulate = myArgs[0] || 'SonicHub2'
const emulate_init = './device/' + emulate + '.js'

// Load device specific init info
debug('Loading %s', emulate_init)
require(emulate_init)
const defaultTransmitPGNs = require(emulate_init).defaultTransmitPGNs
module.exports.defaultTransmitPGNs = defaultTransmitPGNs

const deviceAddress = myArgs[1];
//  const deviceAddress = require(emulate_init).deviceAddress;
module.exports.deviceAddress = deviceAddress;

debug('deviceAddress: %j', deviceAddress)

require('./canboatjs')
require('./canboatjs/lib/canbus')
const canDevice = require('./canboatjs/lib/canbus').canDevice
// const device = require('./canboatjs/lib/candevice').device
const canbus = new (require('./canboatjs').canbus)({})
const util = require('util')



// PGN variables
var pgn130850 = [];
var pgn130816 = [];
var state_count = 0;

// Raymarine setup
const raymarine_state_command = "%s,3,126720,%s,%s,16,3b,9f,f0,81,86,21,%s,00,00,00,00,ff,ff,ff,ff,ff";
const raymarine_state_code = {
    "standby":      "02,fd,00,00,00",
    "auto":         "01,fe,00,00,00",
    "wind":         "23,dc,00,00,00",  // Windvane mode
    "navigation":   "03,fc,3c,42,00"   // Track mode
}

const raymarine_key_command = "%s,3,126720,%s,%s,19,3b,9f,f0,81,86,21,%s,07,01,02,00,00,00,00,00,00,00,00,00,00,00,ff,ff,ff";
const raymarine_key_code = {
    "+1":      "07,f8",
    "+10":     "08,f7",
    "-1":      "05,fa",
    "-10":     "06,f9"
    // "-1-10":   "21,de",
    // "+1+10":   "22,dd"
}

key_command     = "%s,7,126720,%s,%s,16,3b,9f,f0,81,86,21,%s,07,01,02,00,00,00,00,00,00,00,00,00,00,00,ff,ff,ff,ff,ff" // ok
heading_command = "%s,3,126208,%s,%s,14,01,50,ff,00,f8,03,01,3b,07,03,04,06,%s,%s"
wind_command    = "%s,3,126720,%s,%s,16,3b,9f,f0,81,86,21,23,dc,00,00,00,00,00,00,ff,ff,ff,ff,ff",
route_command   = "%s,3,126720,%s,%s,16,3b,9f,f0,81,86,21,03,fc,3c,42,00,00,00,00,ff,ff,ff,ff,ff",
autopilot_dst   = '115' // default converter device id

// Generic functions
function buf2hex(buffer) { // buffer is an ArrayBuffer
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2));
}

// Sleep
const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

// Heartbeat PGN 126993
const hexByte = require('./canboatjs/lib/utilities').hexByte
const heartbeat_msg = "%s,7,126993,%s,255,8,60,ea,%s,ff,ff,ff,ff,ff"
var heartbeatSequencenumber = 0

function heartbeat () {
  heartbeatSequencenumber++
  if (heartbeatSequencenumber > 600) {
    heartbeatSequencenumber = 1
  }
  msg = util.format(heartbeat_msg, (new Date()).toISOString(), canbus.candevice.address, hexByte(heartbeatSequencenumber))
  canbus.sendPGN(msg)
}

function sourceSelection (source) {
  // SourcePGN = "%s,7,130820,%s,255,12,a3,99,02,80,0b,0b,0a,05,02,42,54,00"
  SourcePGN = "%s,7,130820,%s,255,12,a3,99,02,80,0b,0b,0a,25,02,42,54,00"
  SourcePGN = util.format(SourcePGN, (new Date()).toISOString(), canbus.candevice.address);
  debug('Sending SourcePGN %j', SourcePGN);
  canbus.sendPGN(SourcePGN);
}

function power (power_state) {
  // PowerPGN = "%s,6,126720,%s,255,5,a3,99,1c,00,01"
  // PowerPGN = util.format(PowerPGN, (new Date()).toISOString(), canbus.candevice.address);
  // debug('Sending PowerPGN2 %j', PowerPGN);
  // canbus.sendPGN(PowerPGN);

  PowerPGN = "%s,7,130820,%s,255,5,a3,99,20,80,01"
  PowerPGN = util.format(PowerPGN, (new Date()).toISOString(), canbus.candevice.address);
  debug('Sending PowerPGN %j', PowerPGN);
  canbus.sendPGN(PowerPGN);
}

function sendConfig () {
  // %s,6,126998,%s,255,40,08,01,55,44,2d,36,35,30,08,01,46,55,53,49,4f,4e,18,01,46,75,73,69,6f,6e,20,45,6c,65,63,74,72,6f,6e,69,63,73,20,4c,74,64
  PGN = "%s,6,126998,%s,255,40,08,01,55,44,2d,36,35,30,08,01,46,55,53,49,4f,4e,18,01,46,75,73,69,6f,6e,20,45,6c,65,63,74,72,6f,6e,69,63,73,20,4c,74,64"
  PGN = util.format(PGN, (new Date()).toISOString(), canbus.candevice.address);
  debug('Sending config PGN %j', PGN);
  canbus.sendPGN(PGN);
}

function sendSystemConfig () {
  PGN = "%s,6,130579,%s,255,5,a3,99,71,ff"
  PGN = util.format(PGN, (new Date()).toISOString(), canbus.candevice.address);
  debug('Sending system config PGN 130579: %j', PGN);
  canbus.sendPGN(PGN);
}

function send130847 () {
  PGN = "%s,6,59392,%s,%s,8,01,ff,ff,ff,ff,1f,ff,01"
  PGN = util.format(PGN, (new Date()).toISOString(), canbus.candevice.address, msg.pgn.src);
  debug('Sending ISO group PGN 130847: %j', PGN);
  canbus.sendPGN(PGN);
}

async function startup () {
  debug('Sending Startup PGNs');
  power();
  StartupPGNs = [
                        "%s,7,130820,%s,255,12,a3,99,01,80,01,00,17,00,02,00,09,01",
                        "%s,7,130820,%s,255,12,a3,99,21,80,06,46,55,53,49,4f,4e,00",
                        "%s,7,130820,%s,255,5,a3,99,03,80,0d",
                        "%s,7,130820,%s,255,12,a3,99,02,80,0b,0b,0a,25,02,42,54,00",
                        "%s,7,130820,%s,255,23,a3,99,04,80,0b,00,00,00,00,00,00,00,00,00,00,00,00,00,00,00,00,00,00",
                        "%s,7,130820,%s,255,11,a3,99,05,80,0b,00,00,00,00,00,00",
                        "%s,7,130820,%s,255,11,a3,99,06,80,0b,00,00,00,00,00,00",
                        "%s,7,130820,%s,255,11,a3,99,07,80,0b,00,00,00,00,00,00",
                        "%s,7,130820,%s,255,9,a3,99,09,80,0b,00,00,00,00",
                        "%s,7,130820,%s,255,10,a3,99,22,80,04,03,00,ff,ff,03",
                        "%s,7,130820,%s,255,216,a3,99,15,80,1a,00,00,00,06,00,00,00,00,00,00,00,02,00,00,00,00,00,00,00,03,00,00,00,01,00,00,00,04,00,00,00,00,00,00,00,05,00,00,00,00,00,00,00,42,00,00,00,00,00,00,00,43,00,00,00,01,00,00,00,07,00,00,00,00,00,00,00,0e,00,00,00,00,00,00,00,0f,00,00,00,00,00,00,00,10,00,00,00,00,00,00,00,11,00,00,00,00,00,00,00,12,00,00,00,00,00,00,00,13,00,00,00,00,00,00,00,14,00,00,00,00,00,00,00,15,00,00,00,00,00,00,00,16,00,00,00,00,00,00,00,17,00,00,00,00,00,00,00,18,00,00,00,00,00,00,00,19,00,00,00,00,00,00,00,1a,00,00,00,00,00,00,00,1b,00,00,00,00,00,00,00,1c,00,00,00,00,00,00,00,1d,00,00,00,00,00,00,00,1e,00,00,00,00,00,00,00,1f,00,00,00,00,00,00,00",
                        "%s,7,130820,%s,255,184,a3,99,15,80,16,00,00,00,20,00,00,00,00,00,00,00,21,00,00,00,00,00,00,00,22,00,00,00,00,00,00,00,23,00,00,00,00,00,00,00,24,00,00,00,00,00,00,00,25,00,00,00,00,00,00,00,26,00,00,00,00,00,00,00,27,00,00,00,00,00,00,00,28,00,00,00,00,00,00,00,29,00,00,00,00,00,00,00,2a,00,00,00,00,00,00,00,2b,00,00,00,00,00,00,00,00,00,00,00,01,00,00,00,0c,00,00,00,02,00,00,00,0d,00,00,00,00,00,00,00,0b,00,00,00,01,00,00,00,09,00,00,00,01,00,00,00,0a,00,00,00,01,00,00,00,44,00,00,00,01,00,00,00,45,00,00,00,00,00,00,00,47,00,00,00,00,00,00,00,48,00,00,00,01,00,00,00",
                        "%s,7,130820,%s,255,10,a3,99,2c,80,04,04,21,00,00,00",
                        "%s,7,130820,%s,255,14,a3,99,1e,80,0f,00,0f,00,0f,02,00,00,d0,01",
                        "%s,7,130820,%s,255,5,a3,99,17,80,02",
                        "%s,7,130820,%s,255,6,a3,99,18,80,00,00",
                        "%s,7,130820,%s,255,6,a3,99,18,80,01,00",
                        "%s,7,130820,%s,255,6,a3,99,18,80,02,00",
                        "%s,7,130820,%s,255,6,a3,99,19,80,04,01",
                        "%s,7,130820,%s,255,8,a3,99,1a,80,0c,0c,0c,00",
                        "%s,7,130820,%s,255,8,a3,99,1b,80,03,00,00,00",
                        "%s,7,130820,%s,255,8,a3,99,1c,80,18,18,18,00",
                        "%s,7,130820,%s,255,8,a3,99,1d,80,0d,0c,00,00",
                        "%s,7,130820,%s,255,6,a3,99,1f,80,02,00",
                        "%s,7,130820,%s,255,14,a3,99,2d,80,00,07,43,4f,43,4b,50,49,54,00",
                        "%s,7,130820,%s,255,12,a3,99,2d,80,01,05,43,41,42,49,4e,00",
                        "%s,7,130820,%s,255,13,a3,99,2d,80,02,06,5a,6f,6e,65,20,33,00",
                        "%s,7,130820,%s,255,5,a3,99,03,80,0d",
                        "%s,7,130820,%s,255,12,a3,99,02,80,00,0b,00,05,02,41,4d,00",
                        "%s,7,130820,%s,255,12,a3,99,02,80,01,0b,01,05,02,46,4d,00",
                        "%s,7,130820,%s,255,17,a3,99,02,80,02,0b,0c,04,07,50,61,6e,64,6f,72,61,00",
                        "%s,7,130820,%s,255,18,a3,99,02,80,03,0b,0c,04,08,50,61,6e,64,6f,72,61,32,00",
                        "%s,7,130820,%s,255,18,a3,99,02,80,04,0b,03,05,08,53,69,72,69,75,73,58,4d,00",
                        "%s,7,130820,%s,255,14,a3,99,02,80,05,0b,02,05,04,41,75,78,31,00",
                        "%s,7,130820,%s,255,14,a3,99,02,80,06,0b,02,05,04,41,75,78,32,00",
                        "%s,7,130820,%s,255,13,a3,99,02,80,07,0b,05,04,03,55,53,42,00",
                        "%s,7,130820,%s,255,14,a3,99,02,80,08,0b,04,04,04,69,50,6f,64,00",
                        "%s,7,130820,%s,255,16,a3,99,02,80,09,0b,04,04,06,69,50,6f,64,20,32,00",
                        "%s,7,130820,%s,255,13,a3,99,02,80,0a,0b,09,04,03,4d,54,50,00",
                        "%s,7,130820,%s,255,12,a3,99,02,80,0b,0b,0a,25,02,42,54,00",
                        "%s,7,130820,%s,255,13,a3,99,02,80,0c,0b,0e,00,03,44,41,42,00"
];
  for (var nr in StartupPGNs) {
    PGN = util.format(StartupPGNs[nr], (new Date()).toISOString(), canbus.candevice.address)
    canbus.sendPGN(PGN)
    await sleep(2)
  }
}

function requestState () {
  count_hex = state_count.toString(16);
  while (count_hex.length < 2) {
        count_hex = "0" + count_hex;
    }
  requestStatePGN = "%s,3,126720,%s,%s,4,a3,99,01," + count_hex;
  debug("Sending request state reply: %j", requestStatePGN);
  requestStatePGN = util.format(requestStatePGN, (new Date()).toISOString(), canbus.candevice.address, 255);
  canbus.sendPGN(requestStatePGN);
  state_count = state_count + 1
}


function status () {
  // statusPGN = "%s,6,60928,12,255,8,bf,29,61,34,00,82,fa,c0"
  statusPGN = "%s,7,130820,%s,255,9,a3,99,09,80,0b,ee,3d,03,00"
  statusPGN = util.format(statusPGN, (new Date()).toISOString(), canbus.candevice.address, 255);
  canbus.sendPGN(statusPGN);
}

function setTransport () {
  setTransportPGN = "%s,7,130820,%s,%s,5,a3,99,20,00,01" // Paused
  setTransportPGN = util.format(setTransportPGN, (new Date()).toISOString(), canbus.candevice.address, 255);
  canbus.sendPGN(setTransportPGN);
}

function setUnitName () {
  setUnitNamePGN = "%s,7,130820,%s,%s,12,a3,99,21,80,06,46,55,53,49,4f,4e,00"
  setUnitNamePGN = util.format(setUnitNamePGN, (new Date()).toISOString(), canbus.candevice.address, 255);
  canbus.sendPGN(setUnitNamePGN);
}

function setSource () {
  setSourcePGN = "%s,3,126720,%s,%s,5,a3,99,02,00,01"
  setSourcePGN = util.format(setSourcePGN, (new Date()).toISOString(), canbus.candevice.address, 255);
  canbus.sendPGN(setSourcePGN);
}

function setMediaControl () {
  setMediaControlPGN = "%s,3,126720,%s,%s,6,a3,99,03,00,01,01"
  setMediaControlPGN = util.format(setMediaControlPGN, (new Date()).toISOString(), canbus.candevice.address, 255);
  canbus.sendPGN(setMediaControlPGN);
}

function setZoneVolume () {
  setZoneVolumePGN = "%s,3,126720,%s,%s,6,a3,99,18,00,01,00"
  setZoneVolumePGN = util.format(setZoneVolumePGN, (new Date()).toISOString(), canbus.candevice.address, 255);
  canbus.sendPGN(setZoneVolumePGN);
}

function setAllVolume () {
  setAllVolumePGN = "%s,3,126720,%s,%s,9,a3,99,19,00,00,00,00,00"
  setAllVolumePGN = util.format(setAllVolumePGN, (new Date()).toISOString(), canbus.candevice.address, 255);
  canbus.sendPGN(setAllVolumePGN);
}

switch (emulate) {
  case 'default':
      // setTimeout(PGN130822, 5000) // Once at startup
	case 'Fusion':
	    debug('Emulate: Fusion UD-650');
      // setInterval(heartbeat, 60000) // Heart beat PGN
      setInterval(status, 500) // Send status
      setTimeout(power, 10000) // Once at startup
      // setTimeout(sourceSelection, 11000) // Once at startup
      // setInterval(startup, 1000) // Once at startup

	    break;
}

function mainLoop () {
	while (canbus.readableLength > 0) {
	//debug('canbus.readableLength: %i', canbus.readableLength)
    msg = canbus.read()
		// debug('Received packet msg: %j', msg)
	  // debug('msg.pgn.src %i != canbus.candevice.address %i?', msg.pgn.src, canbus.candevice.address)
    if ( msg.pgn.dst == canbus.candevice.address || msg.pgn.dst == 255) {
      msg.pgn.fields = {};
      if (msg.pgn.pgn == 59904) {
        PGN = msg.data[2] * 256 * 256 + msg.data[1] * 256 + msg.data[0];
        debug('ISO request: %j', msg);
        debug('ISO request from %d to %d Data PGN: %i', msg.pgn.src, msg.pgn.dst, PGN);
        msg.pgn.fields.PGN = PGN;
        if (PGN == 126998) {  // testing...
          sendConfig();
        } else if (PGN == 130579) {
          sendSystemConfig();
        } else if (PGN == 130847) {
          send130847();
        } else {
          canbus.candevice.n2kMessage(msg.pgn);
        }
      }
      switch (emulate) {
        case 'SonicHub2':
          if (msg.pgn.pgn == 130850) { // Simnet Event, requires reply
            pgn130850 = pgn130850.concat(buf2hex(msg.data).slice(1)); // Skip multipart byte
            PGN130850 = pgn130850.join(',');
            if (!PGN130850.match(/^..,41,9f,01,ff,ff,/)) {
              pgn130850 = [];
            }

            if (pgn130850.length > 8) { // We have 2 parts now
              debug ('Event AP command: %j %s', msg.pgn, PGN130850);

              // button matching
              if (PGN130850.match(/^0c,41,9f,01,ff,ff,..,1a,00,02,ae,00/)) { // -1
                key_button = "-1";
                debug('B&G button press -1');
              } else if (PGN130850.match(/^0c,41,9f,01,ff,ff,..,1a,00,03,ae,00/)) { // +1
                key_button = "+1";
                debug('B&G button press +1');
              } else if (PGN130850.match(/^0c,41,9f,01,ff,ff,..,1a,00,02,d1,06/)) { // -10
                key_button = "-10";
                debug('B&G button press -10');
              } else if (PGN130850.match(/^0c,41,9f,01,ff,ff,..,1a,00,03,d1,06/)) { // +10
                key_button = "+10";
                debug('B&G button press +10');
              } else if (PGN130850.match(/^0c,41,9f,01,ff,ff,..,06,00,ff,ff,ff/)) { // Standby
                state_button = "standby";
              } else if (PGN130850.match(/^0c,41,9f,01,ff,ff,..,0e,00,ff,ff,ff/)) { // Wind
                state_button = "wind";
              } else if (PGN130850.match(/^0c,41,9f,01,ff,ff,..,0a,00,ff,ff,ff/)) { // Route/navigation
                state_button = "navigation";
              } else if (PGN130850.match(/^0c,41,9f,01,ff,ff,..,09,00,ff,ff,ff/)) { // Auto
                state_button = "auto";
              }
            }
          } else if (msg.pgn.pgn == 126720 && msg.pgn.dst == deviceAddress) { // Fusion PGN
            stateRequest = buf2hex(msg.data).slice(1); // Skip multipart byte
            stateRequest = stateRequest.join(',');
            // debug("Got PGN 126720: %j", stateRequest)
            if (stateRequest.match(/04,a3,99,01,00,ff,ff/)) {
 //             requestState();
              // startup();
              // sourceSelection();
              // setSource();
              // setUnitName();
              // setTransport();
              // setMediaControl();
              // setZoneVolume();
              // setAllVolume();
            }
          }
          break;
        default:
          break;
      }
    }
	}
  setTimeout(mainLoop, 50)
}

// Wait for cansend
function waitForSend () {
  if (canbus.candevice.cansend) {
    //setInterval(state, 1000) // State
    mainLoop()
    return
  }
  setTimeout (waitForSend, 500)
}

waitForSend()
