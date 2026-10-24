# Installation

## Requirements

- Rooted LG TV running reported **webOS 10**. The hardware-tested target is OLED48B5PUA, webOS 10.3.2, firmware 33.31.75.
- Homebrew Channel / root shell already working. Rooting is outside this installer; consult [webOS Homebrew](https://www.webosbrew.org/). No new rooting exploit is included.
- TV and computer on the same trusted network; at least 128 MiB free in `/var/lib`.
- Python 3.9+ on Windows, macOS or Linux. Root SSH access is recommended. OpenSSH must be on the computer's PATH; key-based root login avoids repeated password prompts.
- Dashboard port 8080 and its web interface enabled. The preview currently expects that port. An existing installation using another port is refused rather than reconfigured.

Glasshouse version 0.118.0 at the commit in `upstream.json` is included. No separate Lightkeeper installation is needed. This bundle replaces the Glasshouse server files at `/var/lib/tvweb`; existing server preferences remain local. It is not an overlay for arbitrary future Glasshouse versions.

An installation managed by the Glasshouse Homebrew Channel app is refused because that app can overwrite the custom server. Export its settings and follow Glasshouse's own uninstall/migration instructions before moving to a manual installation. Do not delete a working installation merely to bypass this check.

## Windows

Extract the release ZIP. Open PowerShell in its extracted `rivera-interface-beta` folder:

```powershell
py tools/deploy.py TV_IP --check
py tools/deploy.py TV_IP
```

Replace `TV_IP`, without angle brackets, with the address shown in the TV's network settings. If `py` is unavailable, use `python`.

## macOS / Linux

```sh
python3 tools/deploy.py TV_IP --check
python3 tools/deploy.py TV_IP
```

For a root SSH service on another port, append `--port 2222`, using its actual port.

## Root telnet alternative

If SSH is not set up and Homebrew Channel provides an unauthenticated root shell:

```sh
python tools/deploy.py TV_IP --telnet --check
python tools/deploy.py TV_IP --telnet
```

This transport does not support a username/password login prompt. Use it only on a trusted local network. The installer transfers the bundle directly from the computer; the TV does not download installer code from the internet.

## What happens

The check transfers a temporary bundle, checks its hashes, root access, webOS version and installation mode, then removes the temporary files. It does not replace the launcher.

Installation additionally saves every file it will replace, including the boot hook and Home state. The backup name is printed and recorded in `/var/lib/tvweb/rivera-interface-beta-last-backup`. Existing Home takeover is disabled through Glasshouse's recovery command before replacing files. Individual files are written atomically. A failed file write triggers rollback; a failed server health check restores the saved files. Power loss during installation still requires the manual recovery steps.

The server starts, but Home takeover remains disabled. In a browser, open `http://TV_IP:8080/`, finish any first-run setup, and preview `http://TV_IP:8080/assets/home.html?preview=1`. Preview mode suppresses launch/control actions. Then enable **Glasshouse Home** in the Home section and press Home on the remote.

Do not enable “Hide LG Home at startup” for this beta. Keeping the original fallback available is more useful than hiding every cold-boot frame.

## Home at power-on

After normal Home and recovery have been checked, optional power-on opening can be enabled from a root shell:

```sh
touch /var/lib/tvweb/home-startup-enabled
```

Disable that behavior with:

```sh
rm -f /var/lib/tvweb/home-startup-enabled
```

Then turn the TV off with the remote, wait 15 seconds, and turn it on. A full mains power cycle has additional webOS boot time. Home may show a background while rendering prepares, then play the menu entrance. Holding Home remains the escape to LG Home.

## Optional Scenic screensaver

In the dashboard, open **Screensaver**, choose **Scenic**, and use the dim level first. It follows the native idle trigger and playback/input guards. It does not force a timeout over HDMI gaming. Preview it from Home's Control Center; Back dismisses it. Local headlines are off until enabled in Control Center.

## Updates

Download a Rivera release and rerun the installer. Each install makes a separate backup. The bundled upstream updater is disabled while the Rivera marker exists, because an upstream Glasshouse update would replace this launcher. Keep copies of the release and recovery instructions. Do not assume a new LG firmware release is compatible; see [compatibility and testing](TESTING.md).
