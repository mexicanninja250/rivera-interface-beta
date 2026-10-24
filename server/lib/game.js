/*
 * The frame rate an HDMI source presents, as LG's Game Optimizer shows it.
 *
 * getVRRInfo on the pipeline of the input on screen gives the rate and the VRR
 * type. The rate is the game's own while the source is using VRR; otherwise it
 * is the signal's fixed rate (a console at 120 Hz with VRR off reads 120), and
 * 0 with nothing on the input.
 *
 * webOS 5 gives the rate and type as strings in vrrInfo's sublist_1 and
 * sublist_2: "60.0Hz" and "FIXED" with a 4K60 source (a CX, webOS 5.6).
 * FIXED reads as off.
 *
 * The pipeline exists only while some client holds a utp.extinputs/bind
 * subscription, whose replies carry it as broadcastId; once the bind closes,
 * getVRRInfo on the same id answers errorCode -106, "No resource". The bind
 * replies once on connect. On an input change it says only that the old
 * pipeline disconnected (binded false), with the same id, and nothing of the
 * new one: a C4 (webOS 9) sent nothing more in 70 s after switching back. So
 * a disconnect drops the bind, and the next reader binds afresh.
 *
 * Two readers share one bind. The Game tab's counter (frameRate) streams
 * getVRRInfo once a second while it is asked, and drops the stream IDLE_MS
 * after the last request. The stats (read) make getVRRInfo a one-shot call
 * through the shared luna cache, so a Prometheus scrape never starts the
 * stream, and take the stream's reading instead while it runs. The bind is
 * held while the stream runs or the stats last saw an HDMI input on screen,
 * so nothing is bound to the input otherwise. Without MQTT nothing reports a
 * source change (tvweb.js starts the live subscriptions only with it), so the
 * stats' hold also lapses READ_IDLE_MS after their last read.
 *
 * Strict ES5 for node 0.12 on webOS 4.
 */
var luna = require('./luna');
var names = require('./names');

var IDLE_MS = 15000;
// Well above any scrape interval, so a TV being scraped never rebinds.
var READ_IDLE_MS = 300000;
var READ_TTL_MS = 2000;
// The bind's first reply, after a luna-send has started; a read waits this
// long for it rather than coming back empty after every switch to an input.
var BIND_WAIT_MS = 1500;

var lunaCachedFn = null;
var bindSub = null;
var vrrSub = null;
var pipeline = null;
var supported = true;
var inputShown = false;
var idleTimer = null;
var readIdleTimer = null;
var latest = noReading();
var waiting = [];
var waitTimer = null;

// An app id's short id, an HDMI input's port key (hdmi3) under any app id.
var inputKeyFn = names.shortAppId;

function init(opts) {
  lunaCachedFn = opts.lunaCached;
  if (opts.inputKey) inputKeyFn = opts.inputKey;
}

function noReading() {
  return { frameRate: 0, vrrType: 'off', port: null };
}

function isInputApp(appId) {
  return names.isHdmiKey(inputKeyFn(appId));
}

// A reading counts only while its input is the app on screen: the input's
// pipeline keeps running, and reporting, behind an app.
function onScreen(r, appId) {
  if (!r || !r.port || names.hdmiKeyForPortId(r.port) !== inputKeyFn(appId)) return null;
  return { frameRate: r.frameRate, vrrType: r.vrrType, port: r.port };
}

function fromReply(r) {
  var info = r && r.returnValue !== false && r.vrrInfo;
  if (!info) return null;
  if (typeof info.frameRate !== 'number' && typeof info.sublist_1 === 'string') {
    var hz = parseFloat(info.sublist_1);
    return {
      frameRate: isNaN(hz) ? 0 : hz,
      vrrType: !info.sublist_2 || info.sublist_2 === 'FIXED' ? 'off' : info.sublist_2,
      port: r.port || null
    };
  }
  return {
    frameRate: typeof info.frameRate === 'number' ? info.frameRate : 0,
    vrrType: info.vrrType || 'off',
    port: r.port || null
  };
}

function flushWaiting() {
  clearTimeout(waitTimer);
  waitTimer = null;
  var list = waiting;
  waiting = [];
  for (var i = 0; i < list.length; i++) list[i]();
}

function watchPipeline() {
  if (vrrSub) vrrSub.stop();
  latest = noReading();
  vrrSub = new luna.Subscription('com.webos.service.utp.extinputs/getVRRInfo',
    { subscribe: true, pipelineId: pipeline, mode: 'GameOptimizer', interval: 1000 }, null, {
      message: function (r) {
        var reading = fromReply(r);
        if (reading) latest = reading;
      }
    });
  vrrSub.start();
}

function bindMessage(r) {
  if (r && (r.binded === false || r.status === 'disconnected')) {
    // Not rebound here: the new input's pipeline exists only once its app is
    // up, and the next read or frameRate binds again anyway.
    dropPipeline();
  } else if (r && r.broadcastId) {
    if (r.broadcastId !== pipeline) {
      pipeline = r.broadcastId;
      if (vrrSub) watchPipeline();
    }
    if (idleTimer && !vrrSub) watchPipeline();
  } else if (r && r.returnValue === false && /unknown (method|service)/i.test(String(r.errorText || ''))) {
    // A TV without the service is not asked again: each retry starts a
    // luna-send, which is what can freeze node 0.12 (see luna.js).
    supported = false;
    stopStream();
  }
  flushWaiting();
}

function holdBind() {
  var wanted = supported && (!!idleTimer || inputShown);
  if (wanted && !bindSub) {
    bindSub = new luna.Subscription('com.webos.service.utp.extinputs/bind', { subscribe: true }, null, {
      message: bindMessage,
      close: function () { pipeline = null; }
    });
    bindSub.start();
  } else if (!wanted && bindSub) {
    bindSub.stop();
    bindSub = pipeline = null;
    flushWaiting();
  }
}

function dropPipeline() {
  if (vrrSub) vrrSub.stop();
  vrrSub = null;
  latest = noReading();
  if (bindSub) bindSub.stop();
  bindSub = pipeline = null;
  flushWaiting();
}

function stopStream() {
  clearTimeout(idleTimer);
  idleTimer = null;
  if (vrrSub) vrrSub.stop();
  vrrSub = null;
  latest = noReading();
  holdBind();
}

// The Game tab's reading; starts the stream if it was not running, and keeps
// it going.
function frameRate() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(stopStream, IDLE_MS);
  holdBind();
  if (!vrrSub && pipeline) watchPipeline();
  return { frameRate: latest.frameRate, vrrType: latest.vrrType, port: latest.port };
}

/*
 * The stats' reading for the app on screen, cb({ frameRate, vrrType, port }),
 * or cb(null) when it is not an HDMI input or the TV gives none. An appId
 * other than an input's drops the bind, unless the stream holds it.
 */
function read(appId, cb) {
  setInputShown(isInputApp(appId));
  if (!inputShown || !supported || !lunaCachedFn) return cb(null);
  if (!pipeline && !vrrSub) {
    waiting.push(function () { readPipeline(appId, cb); });
    if (!waitTimer) waitTimer = setTimeout(flushWaiting, BIND_WAIT_MS);
    return;
  }
  readPipeline(appId, cb);
}

function readPipeline(appId, cb) {
  // The stream already asks once a second.
  if (vrrSub) return cb(onScreen(latest, appId));
  if (!pipeline) return cb(null);
  lunaCachedFn('com.webos.service.utp.extinputs/getVRRInfo',
    { pipelineId: pipeline, mode: 'GameOptimizer' }, READ_TTL_MS, function (r) {
      cb(onScreen(fromReply(r), appId));
    });
}

function setInputShown(shown) {
  inputShown = shown;
  clearTimeout(readIdleTimer);
  readIdleTimer = shown ? setTimeout(function () { setInputShown(false); }, READ_IDLE_MS) : null;
  holdBind();
}

// Leaving an input drops the bind without waiting for the next stats read.
function appChanged(appId) {
  if (!isInputApp(appId)) setInputShown(false);
}

function stop() {
  setInputShown(false);
  stopStream();
}

module.exports = {
  init: init,
  frameRate: frameRate,
  read: read,
  appChanged: appChanged,
  stop: stop
};
