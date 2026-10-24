/*
 * lib/homescreen-webos10.js - the parts of LG's Home screen on webOS 10,
 * switched off through an overlay on the home app's own layout
 *
 * webOS 10's home app (Flutter) lays out its first screen from home.xml in its
 * assets folder, on the read-only system, and looks nowhere writable for it:
 * its compiled code names no such path (a C4 on 11.2.0, #612). So a changed
 * home.xml is laid over LG's folder with an overlay mount (the TV's kernel has
 * overlayfs), which leaves every other file LG's, and the home app is
 * restarted to read it. The mount does not survive a restart of the TV, so
 * reapply() puts it back when the server starts.
 *
 * What is offered is what has been shown to work on webOS 10 TVs
 * (github.com/mareklarek/webos10-homescreen-customization): taking out the
 * Quick Cards and the recommended shelf, and shrinking the side icons to
 * nothing, placed after the banner. Taking the side icons out instead left
 * the screen black. Experimental: offered only once allowHomeLayout is set.
 *
 * Strict ES5: runs on node 0.12.
 */
var fs = require('fs');
var path = require('path');
var execFile = require('child_process').execFile;
var msg = require('./say').msg;

var HOME_ID = 'com.webos.app.home';
var PARTS = [
  { id: 'sideIcons', item: 'globalline' },
  { id: 'quickCards', item: 'qcardList' },
  { id: 'recommended', item: 'recommendedShelf' }
];

var lunaFn = null;
var config = null;
var webosVersion = null;
var assetsDir = '/usr/palm/applications/com.webos.app.home/data/flutter_assets/assets';
var stateDir = '/var/lib/tvweb';
var overlayDir = '/tmp/glasshouse-home';
var mountsFile = '/proc/mounts';
var filesystemsFile = '/proc/filesystems';
var checkpointDirs = ['/tmp/checkpoint', '/mnt/lg/cmn_data/checkpoint'];
var procDir = '/proc';
var supportedCache = null;

// Paths are options so test/test-homescreen-webos10.js can use a stand-in.
function init(opts) {
  opts = opts || {};
  lunaFn = opts.luna || null;
  config = opts.config || null;
  webosVersion = opts.webosVersion || null;
  ['assetsDir', 'stateDir', 'overlayDir', 'mountsFile', 'filesystemsFile', 'checkpointDirs', 'procDir'].forEach(function (k) {
    if (opts[k]) setPath(k, opts[k]);
  });
  supportedCache = null;
}

function setPath(k, v) {
  if (k === 'assetsDir') assetsDir = v;
  else if (k === 'stateDir') stateDir = v;
  else if (k === 'overlayDir') overlayDir = v;
  else if (k === 'mountsFile') mountsFile = v;
  else if (k === 'filesystemsFile') filesystemsFile = v;
  else if (k === 'checkpointDirs') checkpointDirs = v;
  else if (k === 'procDir') procDir = v;
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

function homeXml() { return path.join(assetsDir, 'home.xml'); }
// LG's own home.xml, kept: once the overlay is mounted it cannot be read.
function lgCopy() { return path.join(stateDir, 'home-webos10-lg.xml'); }
function stateFile() { return path.join(stateDir, 'home-webos10.json'); }

function mounted() {
  var m = readText(mountsFile) || '';
  return m.split('\n').some(function (l) {
    var f = l.split(' ');
    return f[1] === assetsDir && f[2] === 'overlay';
  });
}

// LG's layout: from the folder while nothing is mounted over it, else the copy.
function lgLayout() {
  return mounted() ? readText(lgCopy()) : readText(homeXml());
}

// The single-line items this module changes, each present once.
function recognised(xml) {
  if (!xml) return false;
  return PARTS.every(function (p) {
    var n = xml.split('\n').filter(function (l) { return l.indexOf('id="' + p.item + '"') !== -1; }).length;
    return n === 1;
  }) && /<item id="herobanner"[^>]*\/>/.test(xml) && /id="container" hasChildren="true"/.test(xml);
}

/*
 * webOS 10 only: webOS 11 adds a second page and drops the side icons, and is
 * left until one has been tried.
 */
function supported() {
  if (supportedCache !== null) return supportedCache;
  supportedCache = /^10\./.test(String(webosVersion || '')) &&
    /\boverlay\b/.test(readText(filesystemsFile) || '') && recognised(lgLayout());
  return supportedCache;
}

function allowed() { return !!(config && config.allowHomeLayout === true); }

function readHidden() {
  try {
    var h = JSON.parse(fs.readFileSync(stateFile(), 'utf8')).hidden;
    return Array.isArray(h) ? h.filter(function (id) { return PARTS.some(function (p) { return p.id === id; }); }) : [];
  } catch (e) { return []; }
}

function parts() {
  var hidden = readHidden();
  return PARTS.map(function (p) {
    return { id: p.id, title: partTitle(p.id), desc: partDesc(p.id), shown: hidden.indexOf(p.id) === -1 };
  });
}

function partTitle(id) {
  switch (id) {
    case 'sideIcons': return msg('srv.home.sideIcons', 'Side buttons');
    case 'quickCards': return msg('srv.home.quickCards', 'Quick Cards');
    case 'recommended': return msg('srv.home.recommended', 'Recommended shelf');
  }
  return id;
}

function partDesc(id) {
  switch (id) {
    case 'sideIcons': return msg('srv.home.sideIcons.desc', 'The profile, notifications, settings and search buttons beside the banner. Settings and search stay on the remote\'s own buttons.');
    case 'quickCards': return msg('srv.home.quickCards.desc', 'The coloured buttons for LG\'s offers, Sports, Gaming, Music and others.');
    case 'recommended': return msg('srv.home.recommended.desc', 'The row of programmes and films LG recommends, below the apps.');
  }
  return '';
}

// LG's layout with the hidden parts taken out, or the side icons shrunk to
// nothing and moved after the banner.
function itemHeight(l) {
  var m = /itemHeight="(\d+)"/.exec(l);
  return m ? Number(m[1]) : 0;
}

// The home app lays the rows out top to bottom from their heights, so a row
// that is only removed pulls the apps row up to the middle of the screen
// (#612). The banner takes over the height of each removed row and the gap
// above it, keeping the apps row where LG puts it.
function buildLayout(lg, hidden) {
  var lines = lg.split('\n');
  var sideLine = null;
  var freed = 0;
  var out = [];
  lines.forEach(function (l) {
    if ((hidden.indexOf('quickCards') !== -1 && l.indexOf('id="qcardList"') !== -1) ||
        (hidden.indexOf('recommended') !== -1 && l.indexOf('id="recommendedShelf"') !== -1)) {
      freed += itemHeight(l);
      // The gap after the apps row stays: it keeps the row off the bottom edge.
      var prev = out[out.length - 1];
      if (l.indexOf('qcardList') !== -1 && prev && prev.indexOf('id="margin"') !== -1) freed += itemHeight(out.pop());
      return;
    }
    if (hidden.indexOf('sideIcons') !== -1 && l.indexOf('id="globalline"') !== -1) {
      sideLine = l.replace(/itemWidth="\d+"/, 'itemWidth="0"').replace(/itemHeight="\d+"/, 'itemHeight="0"');
      return;
    }
    out.push(l);
    if (sideLine && /<item id="herobanner"/.test(l)) {
      out.push(sideLine);
      sideLine = null;
    }
  });
  if (freed) {
    out = out.map(function (l) {
      if (!/id="(container|herobanner|globalline)"/.test(l) || !itemHeight(l)) return l;
      return l.replace(/itemHeight="\d+"/, 'itemHeight="' + (itemHeight(l) + freed) + '"');
    });
  }
  return out.join('\n');
}

function sh(cmd, cb) {
  execFile('/bin/sh', ['-c', cmd], { timeout: 8000 }, function (err, out, errOut) {
    cb(err ? (String(errOut || '').trim() || err.message) : null);
  });
}

function q(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

// The overlay with our home.xml on top of LG's folder, replacing any before.
function mountLayout(xml, cb) {
  var upper = path.join(overlayDir, 'upper');
  var work = path.join(overlayDir, 'work');
  // home.xml arrives on stdin.
  var cmd = 'umount ' + q(assetsDir) + ' 2>/dev/null; rm -rf ' + q(overlayDir) +
    ' && mkdir -p ' + q(upper) + ' ' + q(work) +
    ' && cat > ' + q(path.join(upper, 'home.xml')) +
    ' && mount -t overlay overlay -o ' + q('lowerdir=' + assetsDir + ',upperdir=' + upper + ',workdir=' + work) + ' ' + q(assetsDir);
  var child = execFile('/bin/sh', ['-c', cmd], { timeout: 8000 }, function (err, out, errOut) {
    cb(err ? (String(errOut || '').trim() || err.message) : null);
  });
  child.stdin.end(xml);
}

function unmountLayout(cb) {
  sh('umount ' + q(assetsDir) + ' 2>/dev/null; rm -rf ' + q(overlayDir) + '; true', function () { cb(); });
}

/*
 * Applies the hidden parts: the overlay when any is hidden, none otherwise,
 * and the home app restarted to read it.
 */
function apply(hidden, cb) {
  if (!hidden.length) {
    return unmountLayout(function () { restartHome(cb); });
  }
  var lg = lgLayout();
  if (!recognised(lg)) return cb(msg('srv.home.noLayout', 'Could not read LG\'s Home screen layout'));
  try { fs.writeFileSync(lgCopy(), lg, 'utf8'); } catch (e) { return cb(e.message); }
  mountLayout(buildLayout(lg, hidden), function (err) {
    if (err) return cb(err);
    restartHome(cb);
  });
}

function setPart(id, shown, cb) {
  if (!supported()) return cb({ ok: false, error: msg('srv.home.unsupported', 'This TV\'s Home screen cannot be changed from here') });
  if (!allowed()) return cb({ ok: false, error: msg('srv.home.notAllowed', 'Switch on Home screen layout first. It is experimental on this TV.') });
  if (!PARTS.some(function (p) { return p.id === id; })) return cb({ ok: false, error: msg('srv.home.unknownPart', 'There is no such part of the Home screen') });
  var hidden = readHidden().filter(function (h) { return h !== id; });
  if (!shown) hidden.push(id);
  try {
    if (hidden.length) fs.writeFileSync(stateFile(), JSON.stringify({ hidden: hidden }) + '\n', 'utf8');
    else if (fs.existsSync(stateFile())) fs.unlinkSync(stateFile());
  } catch (e) {
    return cb({ ok: false, error: e.message });
  }
  console.log('homescreen: ' + id + (shown ? ' shown' : ' hidden') + ' (webOS 10)');
  apply(hidden, function (err) { cb(err ? { ok: false, error: err } : { ok: true }); });
}

// LG's Home screen back: the overlay off, the choices forgotten.
function restore(cb) {
  var had = mounted() || readHidden().length > 0;
  try { if (fs.existsSync(stateFile())) fs.unlinkSync(stateFile()); } catch (e) {}
  if (!had) return cb({ ok: true, changed: false });
  console.log('homescreen: LG\'s layout put back (webOS 10)');
  unmountLayout(function () {
    restartHome(function (err) { cb(err ? { ok: false, error: err } : { ok: true, changed: true }); });
  });
}

/*
 * At start: the overlay back where parts are hidden and it is gone, as after
 * a restart of the TV. Nothing where it is still mounted, such as after the
 * server alone restarted.
 */
function reapply(cb) {
  cb = cb || function () {};
  if (!supported() || !allowed() || mounted()) return cb();
  var hidden = readHidden();
  if (!hidden.length) return cb();
  console.log('homescreen: putting the Home screen layout back (webOS 10)');
  apply(hidden, function (err) {
    if (err) console.error('homescreen: could not put the layout back: ' + err);
    cb();
  });
}

/*
 * The home app reads its layout when it starts. Killed, the TV may restore it
 * from a CRIU checkpoint with the old layout, so those go first (as on webOS
 * 9; harmless where there are none).
 */
function restartHome(cb) {
  var cmd = checkpointDirs.map(function (d) {
    return 'rm -rf ' + q(d + '/' + HOME_ID) + ' ' + q(d + '/hash_check_' + HOME_ID);
  }).join('; ');
  foreground(function (wasHome) {
    sh(cmd, function (err) {
      if (err) return cb(err);
      var failed = homePids().filter(function (pid) {
        // Checked again: the process may have gone and its id been reused.
        if (!isHome(pid)) return false;
        try { process.kill(pid, 'SIGTERM'); return false; } catch (e) { return e.code !== 'ESRCH'; }
      });
      if (failed.length) return cb(msg('srv.home.noRestart', 'Could not restart the Home screen'));
      if (!wasHome || !lunaFn) return cb(null);
      setTimeout(function () {
        lunaFn('com.webos.applicationManager/launch', { id: HOME_ID }, function () { cb(null); });
      }, 2000);
    });
  });
}

/*
 * The home app's processes. On a C2 (webOS 10.3.1) it runs as
 * "/usr/bin/flutter-client -i com.webos.app.home", so pidof finds nothing
 * (#612); other Flutter apps run as flutter-client too, so only the -i pair
 * marks it. Read from /proc rather than matched with pkill -f, whose pattern
 * would match this server's own shell.
 */
function homePids() {
  var names;
  try { names = fs.readdirSync(procDir); } catch (e) { return []; }
  return names.filter(function (n) { return /^\d+$/.test(n); }).map(Number).filter(isHome);
}

function isHome(pid) {
  var args = (readText(path.join(procDir, String(pid), 'cmdline')) || '').split('\0');
  if (path.basename(args[0]) === HOME_ID) return true;
  for (var i = 1; i < args.length - 1; i++) if (args[i] === '-i' && args[i + 1] === HOME_ID) return true;
  return false;
}

function foreground(cb) {
  if (!lunaFn) return cb(false);
  lunaFn('com.webos.applicationManager/getForegroundAppInfo', {}, function (r) {
    cb(!!(r && r.appId === HOME_ID));
  });
}

module.exports = {
  id: 'webos10',
  experimental: true,
  init: init,
  supported: supported,
  allowed: allowed,
  parts: parts,
  setPart: setPart,
  restore: restore,
  reapply: reapply,
  restartHome: restartHome,
  inputTiles: true,
  PARTS: PARTS,
  buildLayout: buildLayout
};
