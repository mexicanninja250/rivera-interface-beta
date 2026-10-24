# Compatibility and verification

## Hardware observations — 23 October 2026

| Item | Observation |
| --- | --- |
| TV | LG OLED48B5PUA |
| Reported OS | webOS 10.3.2 |
| Firmware | 33.31.75 |
| Home takeover | Home opens the custom launcher; original LG Home remains available |
| Physical standby wake | Owner confirmed Home works and the final entrance is much smoother |
| Entrance duration | 1.2 seconds |
| Instrumented entrances | Two cold starts, two manual replays, two HDMI returns |
| During those entrances | Approximately 44–47 browser callbacks/second; maximum gaps 33.4–50 ms; none above 50 ms |
| Preparation cost | HDMI returns waited approximately 2.6–2.8 seconds before the entrance |
| Caching | One grid build and one catalogue request across each measured return sequence |
| Duplicate visible launch | Did not restart the entrance |
| Scenic | Native preview and Back dismissal worked; forced preview over HDMI was refused by the native guard |
| Gaming | Earlier verification retained HDR Game, VRR/G-SYNC and ALLM on the owner's configuration; entrance-only updates wrote no gaming settings |

The owner's installed build predates the public portability changes. The portable installer, automatic regional defaults and input sorting are covered by the software checks below, not by a fresh destructive installation on another TV. No locked 60 FPS or cross-model performance claim is made.

## Development checks

Run from the repository root with Python 3.9+ and Node.js on PATH:

```sh
python tests/run.py
python tools/deploy.py --dry-run
```

The suite checks native activation in all 12 combinations of visibility, entrance phase and webOS bridge, plus six readiness/cancellation/fail-open scenarios. It also checks payload completeness, path traversal and checksum rejection, backup/restore and forced write failure, regional weather/news behavior, and JavaScript syntax.

Before expanding compatibility, test a complete install, native Home escape, remote off/on, mains reboot, app launch, each HDMI input, audio return, HDR and VRR on the target TV. Record the reported webOS version and firmware, not only its model year. Do not publish serial numbers, configuration tokens or full device dumps in reports.

## Current limits

Only webOS 10 passes installer preflight. Other webOS versions and other LG models remain unverified. Startup background preparation is still visible. Public cards do not integrate personal streaming accounts. The original generated scenic image is below 4K. The shared LG keyboard, pointer, settings menus, and third-party app interfaces retain their own behavior.
