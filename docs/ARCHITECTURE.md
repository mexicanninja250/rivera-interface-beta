# Architecture

The server is derived from Glasshouse 0.118.0 at the exact commit in `upstream.json`. Lightkeeper contributes the logo lookup and logo assets. This repository bundles the compatible server rather than assuming unrelated future server versions expose the same Home APIs.

`server/assets/home.html` is a 1920×1080 logical layout, fitted to the browser viewport. It uses cached app data, DOM reuse, delayed artwork changes, and transform/opacity motion. Public show cards load from `assets/tvos/shows.json`. The custom keyboard is part of this page.

Glasshouse's reversible bind mount places a web app manifest at LG Home's application ID. The original application remains underneath the mount. `home-takeover.js`, `home.js` and `50-tvweb.sh` provide native Home integration, boot restoration and escape paths. The watchdog restores the native Home path if the web view stops reporting. This is a Home replacement, not a replacement kernel, firmware, HDMI pipeline, codec stack or compositor.

## Entrance lifecycle

The page starts with its menu at near-zero opacity and the animation paused. Native `webOSRelaunch` events always call `activate()`; that requirement is preserved even when browser visibility already says the page is visible. Skipping that call previously caused black Home on physical wake.

After native activation, the page waits for a short sequence of steady animation-frame callbacks before playing the 1.2-second entrance. A bounded wait handles a cold redirect that consumed the launch event. A 4.5-second timer reveals the menu if frame callbacks do not recover. Normal completion follows `animationend`; navigation keys cancel the wait/animation immediately. Duplicate relaunches while already visible do not replay the entrance.

This shifts initial rendering stalls before the animation. It does not eliminate webOS wake/app-switch costs. Browser callback timing also does not measure every physical scanout frame.

## Public release changes

The entrance activation handlers match the owner-confirmed build. The public package changes HDMI sorting to numeric port order and makes weather/news regional defaults portable. News becomes opt-in. It includes the root installer, integrity manifest and backup helper, and prevents the upstream updater from replacing the customized server. No owner configuration files or live TV dumps are copied into the repository.

## Installation boundary

The payload builder includes only checked-in assets, server modules and named executable files. The TV helper validates relative paths and SHA-256 hashes, rejects symlink targets, backs up overwritten files, and uses temporary files plus rename for writes. File-write failure invokes rollback. The transport performs a server health check and restores the previous files if it fails.

Installed code lives under `/var/lib/tvweb`; the persistent boot hook is `/var/lib/webosbrew/init.d/50-tvweb`. Enabling Home or Scenic uses Glasshouse's native takeover mechanisms. System-wide sounds and firmware-specific HDMI banner patches are outside this package.
