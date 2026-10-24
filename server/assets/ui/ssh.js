// SSH keys, in the Server tab's Advanced section: who can log in as root.

let sshStatus = null;

function sshMessage(text) {
  const m = q('ssh-msg');
  m.textContent = text;
  m.hidden = !text;
}

/*
 * What SSH lets in now and after the next boot: the Homebrew Channel gives
 * root the password "alpine" at boot only while there is no key file.
 */
function sshStateText(d) {
  const parts = [];
  if (!d.running) parts.push(t('server.ssh.notRunning', 'SSH is off in the Homebrew Channel, so none of this applies until it is turned on there and the TV restarted.'));
  if (!d.fileExists) {
    parts.push(d.passwordNow
      ? t('server.ssh.password', 'There is no key file, so root logs in with the password alpine, which everyone knows. Adding a key ends that from the next reboot.')
      : t('server.ssh.passwordAfterReboot', 'The key file is deleted. From the next reboot root logs in with the password alpine, which everyone knows. Until then nothing can log in over SSH.'));
  } else {
    if (!d.keys.length) parts.push(t('server.ssh.noKeys', 'The key file has no keys, so nothing can log in over SSH until one is added.'));
    if (d.passwordNow) parts.push(t('server.ssh.passwordUntilReboot', 'The password alpine still works until the next reboot.'));
  }
  return parts.join(' ');
}

function renderSsh(d) {
  sshStatus = d;
  const state = q('ssh-state');
  state.textContent = sshStateText(d);
  q('ssh-token').hidden = !d.needsToken;
  state.classList.toggle('warn', !d.fileExists || !!d.passwordNow);
  q('ssh-keys').innerHTML = d.keys.map(k =>
    `<div class="ssh-key"><div class="ssh-k"><div translate="no">${esc(k.comment || k.type)}</div>` +
    `<div class="ssh-print" translate="no">${esc(k.type + ' ' + k.fingerprint)}</div></div>` +
    `<button type="button" class="link-btn" data-print="${esc(k.fingerprint)}"${d.writable ? '' : ' disabled'}>${esc(t('server.ssh.remove', 'Remove'))}</button></div>`
  ).join('');
  for (const b of q('ssh-keys').querySelectorAll('button')) b.onclick = () => removeSshKey(b.dataset.print);
  q('ssh-new').disabled = q('ssh-add').disabled = !d.writable;
  const del = q('ssh-delete');
  del.hidden = !d.fileExists;
  del.disabled = !d.writable;
  // What was changed takes a reboot to apply.
  q('ssh-reboot').hidden = !d.writable || (d.passwordNow === !d.fileExists) || d.passwordNow === null;
}

async function sshRequest(body) {
  const r = await fetch(api('/api/ssh'), body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  } : { cache: 'no-store' });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || r.status);
  return d;
}

async function loadSsh() {
  try { renderSsh(await sshRequest()); } catch (e) {
    sshMessage(t('server.ssh.failed', 'Could not read the SSH keys — {error}', { error: e.message }));
  }
}

async function addSshKey() {
  const input = q('ssh-new');
  const key = input.value.trim();
  if (!key) return;
  try {
    renderSsh(await sshRequest({ action: 'add', key }));
    input.value = '';
    sshMessage('');
  } catch (e) { sshMessage(e.message); }
}

async function removeSshKey(print) {
  const last = sshStatus && sshStatus.keys.length === 1;
  if (!confirm(last
    ? t('server.ssh.removeLastConfirm', 'Remove the last key? Nothing will be able to log in over SSH until a key is added.')
    : t('server.ssh.removeConfirm', 'Remove this key? It will no longer be able to log in.'))) return;
  try {
    renderSsh(await sshRequest({ action: 'remove', fingerprint: print }));
    sshMessage('');
  } catch (e) { sshMessage(e.message); }
}

async function deleteSshKeys() {
  if (!confirm(t('server.ssh.deleteConfirm', 'Delete the key file? No key will log in from now on, and from the next reboot root logs in with the password alpine, which everyone knows. Until that reboot nothing can log in over SSH.'))) return;
  try {
    renderSsh(await sshRequest({ action: 'deleteFile' }));
    sshMessage('');
  } catch (e) { sshMessage(e.message); }
}
