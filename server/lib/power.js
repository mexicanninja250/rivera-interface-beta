'use strict';
/*
 * Why the TV last powered on, and a log line at each power transition.
 * Strict ES5 for Node 0.12.2 on webOS 4.
 *
 * tvpower answers the reason and the times only when asked, so they are read
 * at start and after each transition, never for a request. tvpower has no
 * method for the reason for a power-off, and its log line for one is in the
 * system log, on tmpfs, so the transition's line goes to the syslog forwarder
 * at once rather than at its next poll, which a power-off can beat.
 */

var monotonicMs = require('./util').monotonicMs;
var names = require('./names');

var REASON_URI = 'com.webos.service.tvpower/power/getPowerOnReason';
var TIME_URI = 'com.webos.service.tvpower/power/getPowerOnTime';

var luna = null;
var log = console.log;
// Not Date.now(): the clock steps forward years when it syncs.
var clockFn = monotonicMs;
/** @type {typeof import('./syslog')} */
var syslogModule = null;
var onReason = null;
var onTime = null;
// When onTime was read, on clockFn.
var onTimeReadAt = 0;
// The raw power state last seen, null until the first.
var lastState = null;

// tvpower gives the times as strings of seconds: "27196.63".
function seconds(v) {
  if (typeof v !== 'number' && (typeof v !== 'string' || !/\S/.test(v))) return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

/**
 * The reason from a getPowerOnReason reply, or null.
 * @param {any} reply
 * @returns {?string}
 */
function parseReason(reply) {
  if (!reply || reply.returnValue === false) return null;
  return typeof reply.reason === 'string' && reply.reason ? reply.reason : null;
}

/**
 * The times from a getPowerOnTime reply, in seconds, or null.
 * @param {any} reply
 * @returns {?{uptime: ?number, ontime: ?number}}
 */
function parseTime(reply) {
  var t = reply && reply.returnValue !== false ? reply.time : null;
  if (!t || typeof t !== 'object') return null;
  return { uptime: seconds(t.uptime), ontime: seconds(t.ontime) };
}

/**
 * Reads both afresh. A TV without the methods leaves both null.
 * @param {function(): void} [done]
 */
function refresh(done) {
  done = done || function () {};
  if (!luna) return done();
  luna(REASON_URI, {}, function (r) {
    onReason = parseReason(r);
    luna(TIME_URI, {}, function (t) {
      onTime = parseTime(t);
      onTimeReadAt = clockFn();
      done();
    });
  });
}

// Rounded to centiseconds, tvpower's own precision.
function movedOn(v, since) {
  return Math.round((v + since) * 100) / 100;
}

/**
 * The last reading, as /api/stats gives it under powerState. The times are
 * read only at start and at transitions, so they are moved on by the time
 * since; an ontime of 0 is the TV in standby and stays 0.
 * @returns {{onReason: ?string, onTime: ?{uptime: ?number, ontime: ?number}}}
 */
function current() {
  if (!onTime) return { onReason: onReason, onTime: null };
  var since = (clockFn() - onTimeReadAt) / 1000;
  return {
    onReason: onReason,
    onTime: {
      uptime: onTime.uptime === null ? null : movedOn(onTime.uptime, since),
      ontime: onTime.ontime ? movedOn(onTime.ontime, since) : onTime.ontime
    }
  };
}

function flush() {
  if (syslogModule) syslogModule.flush();
}

// Reads once at start and logs why the TV is on.
function start() {
  refresh(function () {
    if (!onReason) {
      log('power: the TV gives no power-on reason');
      return;
    }
    var up = onTime && onTime.uptime !== null ? ', up ' + Math.round(onTime.uptime) + ' s' : '';
    log('power: on by ' + onReason + up);
  });
}

/**
 * A line for each change of the raw power state, then a forwarder poll.
 * Turning on, the line waits for the reason read after it; anything else is
 * logged before the read, since the TV may be about to power off.
 * @param {string} state the raw state, as tvpower gives it
 */
function stateChanged(state) {
  var from = lastState, to = String(state);
  lastState = to;
  // The first reading is where the TV was at start, not a transition.
  if (from === null || from === to) return;
  var line = 'power: ' + from + ' -> ' + to;
  var turningOn = names.powerState(to).systemOn && !names.powerState(from).systemOn;
  if (!turningOn) {
    log(line);
    flush();
    refresh();
    return;
  }
  refresh(function () {
    log(line + (onReason ? ', on by ' + onReason : ''));
    flush();
  });
}

/**
 * A raw tvpower state as /api/stats gives it: label is the display name.
 * @param {string} raw
 */
function mapState(raw) {
  var name = names.powerState(raw);
  return { raw: raw || null, label: name.display, systemOn: name.systemOn, screenOn: name.screenOn };
}

/*
 * Whether a screen saver is on screen. tvpower reports it as a power state of
 * its own, which is the only source that tracks it: the foreground app does
 * not change - the screen saver draws over whatever is running - and the
 * running-apps list keeps the screen saver app long after it has gone.
 *
 * Measured on a B8: "Screen Saver" while one draws, "Active" once a key
 * dismisses it.
 */
function isScreenSaver(ps) {
  return !!ps && names.powerState(ps.raw) === names.POWER_STATES.screensaver;
}

/**
 * @param {Object} opts
 * @param {function(string, Object, function(any, string=): void): void} opts.luna
 * @param {typeof import('./syslog')} opts.syslog
 * @param {function(string): void} [opts.log] where the lines go, for tests
 * @param {function(): number} [opts.clock] monotonic milliseconds, for tests
 */
function init(opts) {
  luna = opts.luna;
  log = opts.log || console.log;
  clockFn = opts.clock || monotonicMs;
  syslogModule = opts.syslog || null;
  onReason = null;
  onTime = null;
  lastState = null;
}

module.exports = {
  init: init,
  start: start,
  refresh: refresh,
  current: current,
  stateChanged: stateChanged,
  mapState: mapState,
  isScreenSaver: isScreenSaver,
  parseReason: parseReason,
  parseTime: parseTime
};
