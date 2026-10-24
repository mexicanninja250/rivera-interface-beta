/*
 * The public keys that may log in as root over SSH, in
 * /home/root/.ssh/authorized_keys, for the Server tab to list, add to and
 * remove from. Strict ES5 for Node 0.12.2 on webOS 4.
 *
 * The Homebrew Channel's dropbear reads the file at each login. At boot, the
 * Homebrew Channel gives root the placeholder password "alpine" only when the
 * file does not exist, so deleting it lets the password in from the next
 * boot, and until then nothing can log in over SSH.
 */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var util = require('./util');
var msg = require('./say').msg;

var file = '/home/root/.ssh/authorized_keys';
var shadowFile = '/etc/shadow';
/** @type {function(function(boolean): void): void} */
var sshRunning = dropbearRunning;
var MAX_KEYS = 50;
var MAX_LINE = 16384;

// The key types OpenSSH and dropbear write in authorized_keys.
var TYPES = [
  'ssh-ed25519', 'ssh-rsa', 'ssh-dss',
  'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521',
  'sk-ssh-ed25519@openssh.com', 'sk-ecdsa-sha2-nistp256@openssh.com'
];

// Whether dropbear runs, which the Homebrew Channel starts at boot while its SSH switch is on.
function dropbearRunning(cb) {
  var pids = [];
  try { pids = fs.readdirSync('/proc').filter(function (p) { return /^\d+$/.test(p); }); } catch (e) {}
  cb(pids.some(function (p) {
    try { return fs.readFileSync('/proc/' + p + '/comm', 'utf8').trim() === 'dropbear'; } catch (e) { return false; }
  }));
}

/*
 * A line as { type, blob, comment, options }, or null for a blank line, a
 * comment or one that is not a key. Options, such as from="...", come before
 * the type and may hold quoted spaces.
 */
function parse(line) {
  line = String(line || '').trim();
  if (!line || line.charAt(0) === '#') return null;
  var words = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  for (var i = 0; i < words.length - 1 && i < 2; i++) {
    if (TYPES.indexOf(words[i]) === -1) continue;
    var blob = words[i + 1];
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(blob)) return null;
    var raw = util.toBuffer(blob, 'base64');
    // The blob starts with its own type, as a length and the name.
    if (raw.length < 4 + words[i].length || raw.readUInt32BE(0) !== words[i].length ||
        raw.toString('ascii', 4, 4 + words[i].length) !== words[i]) return null;
    return {
      type: words[i],
      blob: blob,
      comment: words.slice(i + 2).join(' '),
      options: words.slice(0, i).join(' ')
    };
  }
  return null;
}

// SHA256:... as ssh-keygen -l prints it.
function fingerprint(blob) {
  return 'SHA256:' + crypto.createHash('sha256').update(util.toBuffer(blob, 'base64')).digest('base64').replace(/=+$/, '');
}

// The file's lines, without the empty ones it ends with, or null with no file.
function readLines() {
  var lines;
  try { lines = fs.readFileSync(file, 'utf8').split('\n'); } catch (e) { return null; }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

function writeLines(lines) {
  var text = lines.length ? lines.join('\n') + '\n' : '';
  util.mkdirp(path.dirname(file));
  fs.chmodSync(path.dirname(file), parseInt('700', 8));
  var tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.chmodSync(tmp, parseInt('600', 8));
  fs.renameSync(tmp, file);
}

/*
 * Whether root has a password now: the Homebrew Channel puts one in place of
 * the empty field at boot. null where /etc/shadow cannot be read.
 */
function passwordNow() {
  var text;
  try { text = fs.readFileSync(shadowFile, 'utf8'); } catch (e) { return null; }
  var m = /^root:([^:]*):/m.exec(text);
  if (!m) return null;
  return !!m[1] && m[1] !== '*' && m[1].charAt(0) !== '!';
}

/**
 * The keys, and what SSH lets in now and after the next boot.
 * @param {function(Object): void} cb
 */
function status(cb) {
  var lines = readLines();
  var keys = [];
  (lines || []).forEach(function (l) {
    var k = parse(l);
    if (k) keys.push({ type: k.type, comment: k.comment, options: k.options, fingerprint: fingerprint(k.blob) });
  });
  sshRunning(function (running) {
    cb({
      ok: true,
      running: running,
      fileExists: lines !== null,
      keys: keys,
      passwordNow: passwordNow(),
      passwordAfterReboot: lines === null
    });
  });
}

/**
 * Adds a public key, as one line of authorized_keys.
 * @param {string} line
 * @param {function(Object): void} cb
 */
function add(line, cb) {
  line = String(line || '').trim();
  if (line.length > MAX_LINE || /[\r\n]/.test(line)) {
    return cb({ ok: false, error: msg('srv.ssh.oneKey', 'Paste one public key, on one line.') });
  }
  if (/PRIVATE KEY/.test(line)) {
    return cb({ ok: false, error: msg('srv.ssh.private', 'That is a private key. Paste the public key, from the .pub file.') });
  }
  var key = parse(line);
  if (!key) return cb({ ok: false, error: msg('srv.ssh.notKey', 'That is not an SSH public key.') });
  var lines = readLines() || [];
  var have = lines.map(parse).filter(Boolean);
  if (have.some(function (k) { return k.blob === key.blob; })) {
    return cb({ ok: false, error: msg('srv.ssh.already', 'That key is already there.') });
  }
  if (have.length >= MAX_KEYS) return cb({ ok: false, error: msg('srv.ssh.tooMany', 'There are already 50 keys.') });
  try {
    writeLines(lines.concat([line]));
  } catch (e) {
    return cb({ ok: false, error: msg('srv.ssh.writeFailed', 'Could not write {file}: {error}', { file: file, error: e.message }) });
  }
  console.log('ssh: added a ' + key.type + ' key, ' + fingerprint(key.blob));
  status(cb);
}

/**
 * Removes the key with this fingerprint. The file stays, with no keys left in
 * it, so the password does not come back.
 * @param {string} print
 * @param {function(Object): void} cb
 */
function remove(print, cb) {
  var lines = readLines();
  var kept = (lines || []).filter(function (l) {
    var k = parse(l);
    return !(k && fingerprint(k.blob) === print);
  });
  if (!lines || kept.length === lines.length) return cb({ ok: false, error: msg('srv.ssh.noSuchKey', 'That key is not there.') });
  try {
    writeLines(kept);
  } catch (e) {
    return cb({ ok: false, error: msg('srv.ssh.writeFailed', 'Could not write {file}: {error}', { file: file, error: e.message }) });
  }
  console.log('ssh: removed key ' + print);
  status(cb);
}

/**
 * Deletes authorized_keys, so the Homebrew Channel sets the password "alpine"
 * at the next boot.
 * @param {function(Object): void} cb
 */
function deleteFile(cb) {
  try {
    fs.unlinkSync(file);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      return cb({ ok: false, error: msg('srv.ssh.deleteFailed', 'Could not delete {file}: {error}', { file: file, error: e.message }) });
    }
  }
  console.log('ssh: deleted ' + file + '; root\'s password is "alpine" from the next boot');
  status(cb);
}

/**
 * @param {Object} [opts]
 * @param {string} [opts.file] authorized_keys, for tests
 * @param {string} [opts.shadowFile] /etc/shadow, for tests
 * @param {function(function(boolean): void): void} [opts.sshRunning] whether dropbear runs
 */
function init(opts) {
  opts = opts || {};
  if (opts.file) file = opts.file;
  if (opts.shadowFile) shadowFile = opts.shadowFile;
  if (opts.sshRunning) sshRunning = opts.sshRunning;
}

module.exports = {
  init: init,
  parse: parse,
  fingerprint: fingerprint,
  status: status,
  add: add,
  remove: remove,
  deleteFile: deleteFile
};
