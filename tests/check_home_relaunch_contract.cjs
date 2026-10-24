const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(process.argv[2], 'utf8');
const handlers = html.slice(html.indexOf('function activatePreparedHome(){'), html.indexOf('function showStartup('));
assert(handlers.includes('function relaunched()'), 'Relaunch handlers not found');
// With handlesRelaunch enabled, every native relaunch needs activation,
// including when the browser still reports itself visible during wake.
for (const hidden of [false, true]) {
  for (const phase of ['armed', 'playing', 'shown']) {
    for (const bridge of ['webOSSystem', 'PalmSystem']) {
      let activated = 0;
      const c = {document: {hidden}, window: {}, loaded: true, entrancePhase: phase,
        armEntrance() {}, prepareHome() {}, revealHome() {}, returned() {}};
      c.window[bridge] = {activate() { activated++; }};
      vm.runInNewContext(handlers + '\nrelaunched();', c);
      assert.equal(activated, 1, `${bridge}, hidden=${hidden}, phase=${phase}`);
    }
  }
}
console.log('All 12 visible/hidden, entrance-state and platform-bridge relaunch cases activate Home.');
