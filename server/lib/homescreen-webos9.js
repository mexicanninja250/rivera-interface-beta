/*
 * lib/homescreen-webos9.js - the parts of LG's Home screen on webOS 9, switched
 * on and off through the home app's own layout file
 *
 * The home app (com.webos.app.home, QML) lays out its first screen from
 * home_layoutShelfView.xml, looking first in /mnt/lg/cmn_data/manifest/ and
 * falling back to its built-in copy when there is none there; on a C2 (webOS
 * 9.2.2) that folder does not exist. A copy of LG's layout without some of its
 * items, written there, leaves those parts out, survives a restart and a power
 * cut with nothing put back (the home app starts fresh at boot and reads it),
 * and deleting it brings LG's back. Nothing on the read-only system is changed.
 *
 * The home app reads the file only when it starts, so a change restarts it.
 * Killing it makes the TV restore it from its CRIU checkpoint, old layout and
 * all, so the checkpoints are deleted first: the TV makes new ones from the
 * fresh start (docs/development/TV-RESEARCH.md).
 *
 * Strict ES5: runs on node 0.12.
 */
var fs = require('fs');
var path = require('path');
var execFile = require('child_process').execFile;
var msg = require('./say').msg;

var HOME_ID = 'com.webos.app.home';
var MARK = '<!-- glasshouse -->';
var TAKEOVER_MARK = require('./home-takeover').BLANK_MARK;

// LG's item type for each part, in the order the Home screen shows them.
var PARTS = [
  { id: 'banner', type: 'Hero' },
  { id: 'quickCards', type: 'Qcard' },
  { id: 'apps', type: 'AppList' },
  { id: 'deviceFunctions', type: 'AdShelf' }
];

var lunaFn = null;
var homeDir = '/usr/palm/applications/com.webos.app.home/qml';
var layoutDir = '/mnt/lg/cmn_data/manifest';
var checkpointDirs = ['/tmp/checkpoint', '/mnt/lg/cmn_data/checkpoint'];
var webosVersion = null;
var supportedCache = null;

// Paths are options so test/test-homescreen.js can point them at a stand-in.
function init(opts) {
  opts = opts || {};
  lunaFn = opts.luna || null;
  if (opts.homeDir) homeDir = opts.homeDir;
  if (opts.layoutDir) layoutDir = opts.layoutDir;
  if (opts.checkpointDirs) checkpointDirs = opts.checkpointDirs;
  webosVersion = opts.webosVersion || null;
  supportedCache = null;
}

function builtInPath() { return path.join(homeDir, 'UserInterfaceLayer', 'home_layoutShelfView.xml'); }
function mainViewPath() { return path.join(homeDir, 'UserInterfaceLayer', 'Containers', 'MainView_M.qml'); }

// Which of LG's two names the home app reads depends on a test setting, so
// both are written.
function layoutFiles() {
  return ['home_layoutShelfView.xml', 'home_layout.xml'].map(function (f) { return path.join(layoutDir, f); });
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

function itemTypes(xml) {
  var types = [];
  var re = /<item\s[^>]*type="([^"]+)"/g;
  var m;
  while ((m = re.exec(xml || ''))) types.push(m[1]);
  return types;
}

/*
 * Only webOS 9 so far: webOS 3 and 4 have a different home app with little to
 * remove, and webOS 10 and later a Flutter one. A webOS 8 TV whose home app
 * reads the same file could be added once one has been tried.
 */
function supported() {
  if (supportedCache !== null) return supportedCache;
  var ok = /^9\./.test(String(webosVersion || ''));
  if (ok) {
    var mainView = readText(mainViewPath()) || '';
    var lgTypes = itemTypes(readText(builtInPath()));
    ok = mainView.indexOf(layoutDir + '/') !== -1 &&
      PARTS.every(function (p) { return lgTypes.indexOf(p.type) !== -1; });
  }
  // A layout LG put there itself is left alone.
  if (ok) ok = layoutFiles().every(function (f) { var t = readText(f); return t === null || t.indexOf(MARK) !== -1; });
  supportedCache = ok;
  return ok;
}

/*
 * Glasshouse Home gives LG's Home an empty layout to start with while it has
 * its place, and puts the files here back after (lib/home-takeover.js).
 */
function glasshouseHomeOn() {
  return layoutFiles().some(function (f) { var t = readText(f); return t !== null && t.indexOf(TAKEOVER_MARK) !== -1; });
}

// { partId: shown }: everything is shown while there is no file of ours.
function readParts() {
  var ours = readText(layoutFiles()[0]);
  var types = ours && ours.indexOf(MARK) !== -1 ? itemTypes(ours) : null;
  var out = {};
  PARTS.forEach(function (p) { out[p.id] = !types || types.indexOf(p.type) !== -1; });
  return out;
}

function parts() {
  var shown = readParts();
  return PARTS.map(function (p) {
    return { id: p.id, title: partTitle(p.id), desc: partDesc(p.id), shown: shown[p.id] };
  });
}

function partTitle(id) {
  switch (id) {
    case 'banner': return msg('srv.home.banner', 'Banner');
    case 'quickCards': return msg('srv.home.quickCards', 'Quick Cards');
    case 'apps': return msg('srv.home.apps', 'App tiles');
    case 'deviceFunctions': return msg('srv.home.deviceFunctions', 'Recent Input and Device Functions');
  }
  return id;
}

function partDesc(id) {
  switch (id) {
    case 'banner': return msg('srv.home.banner.desc', 'The large picture at the top, with LG\'s adverts or its own message, and the profile, notifications, settings and search buttons beside it.');
    case 'quickCards': return msg('srv.home.quickCards.desc', 'The coloured buttons for LG\'s offers, Sports, Gaming, Music and others.');
    case 'apps': return msg('srv.home.apps.desc', 'The row of apps and inputs.');
    case 'deviceFunctions': return msg('srv.home.deviceFunctions.desc', 'The last input used, and cards for editing the app list, the TV guide, the user guide and Home Hub.');
  }
  return '';
}

// LG's layout without the hidden parts' items, marked as ours.
function buildLayout(shown) {
  var lg = readText(builtInPath());
  if (lg === null) return null;
  var hidden = PARTS.filter(function (p) { return !shown[p.id]; }).map(function (p) { return p.type; });
  var lines = lg.split('\n').filter(function (line) {
    var t = itemTypes(line);
    return !(t.length && hidden.indexOf(t[0]) !== -1);
  });
  var out = lines.join('\n');
  return /^<\?xml[^>]*\?>/.test(out) ? out.replace(/^(<\?xml[^>]*\?>)/, '$1\n' + MARK) : MARK + '\n' + out;
}

function writeFileAtomic(p, text) {
  var tmp = p + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, p);
}

function removeOurs() {
  layoutFiles().forEach(function (f) {
    var t = readText(f);
    if (t !== null && t.indexOf(MARK) !== -1) {
      try { fs.unlinkSync(f); } catch (e) {}
    }
  });
  try { fs.rmdirSync(layoutDir); } catch (e) {} // only goes if empty
}

/*
 * Shows or hides a part. At least one stays, so Home is never empty. cb({ ok,
 * error }) once the home app has been restarted.
 */
function setPart(id, shown, cb) {
  if (glasshouseHomeOn()) return cb({ ok: false, error: msg('srv.home.glasshouseHomeOn', 'Glasshouse Home is in LG\'s Home\'s place. Switch it off on the Home tab to change LG\'s Home screen.') });
  if (!supported()) return cb({ ok: false, error: msg('srv.home.unsupported', 'This TV\'s Home screen cannot be changed from here') });
  if (!PARTS.some(function (p) { return p.id === id; })) return cb({ ok: false, error: msg('srv.home.unknownPart', 'There is no such part of the Home screen') });
  var next = readParts();
  next[id] = !!shown;
  var showing = PARTS.filter(function (p) { return next[p.id]; }).length;
  if (!showing) return cb({ ok: false, error: msg('srv.home.keepOne', 'At least one part of the Home screen has to stay') });
  try {
    if (showing === PARTS.length) {
      removeOurs();
    } else {
      var xml = buildLayout(next);
      if (xml === null) return cb({ ok: false, error: msg('srv.home.noLayout', 'Could not read LG\'s Home screen layout') });
      try { fs.mkdirSync(layoutDir); } catch (e) {}
      layoutFiles().forEach(function (f) { writeFileAtomic(f, xml); });
    }
  } catch (e) {
    return cb({ ok: false, error: e.message });
  }
  console.log('homescreen: ' + id + (shown ? ' shown' : ' hidden'));
  restartHome(function () { cb({ ok: true }); });
}

// LG's own layout back: the file of ours goes, and the home app restarts.
function restore(cb) {
  var had = layoutFiles().some(function (f) { var t = readText(f); return t !== null && t.indexOf(MARK) !== -1; });
  removeOurs();
  supportedCache = null;
  if (!had) return cb({ ok: true, changed: false });
  console.log('homescreen: LG\'s layout put back');
  restartHome(function () { cb({ ok: true, changed: true }); });
}

/*
 * A killed home app is restored from its checkpoint, in /tmp or else the copy
 * in flash, still with the layout it started with; with both gone it starts
 * fresh. Reopened afterwards where it was on screen, as LG does not.
 */
function restartHome(cb) {
  var cmd = checkpointDirs.map(function (d) {
    return 'rm -rf ' + d + '/' + HOME_ID + ' ' + d + '/hash_check_' + HOME_ID;
  }).join('; ') + '; kill $(pidof ' + HOME_ID + ') 2>/dev/null; true';
  foreground(function (wasHome) {
    execFile('/bin/sh', ['-c', cmd], { timeout: 6000 }, function () {
      if (!wasHome || !lunaFn) return cb();
      setTimeout(function () {
        lunaFn('com.webos.applicationManager/launch', { id: HOME_ID }, function () { cb(); });
      }, 2000);
    });
  });
}

function foreground(cb) {
  if (!lunaFn) return cb(false);
  lunaFn('com.webos.applicationManager/getForegroundAppInfo', {}, function (r) {
    cb(!!(r && r.appId === HOME_ID));
  });
}

module.exports = {
  id: 'webos9',
  init: init,
  supported: supported,
  parts: parts,
  setPart: setPart,
  restore: restore,
  restartHome: restartHome,
  inputTiles: true,
  PARTS: PARTS
};
