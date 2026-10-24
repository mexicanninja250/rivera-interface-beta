# Recovery

## A working menu

Hold Home on the remote to return temporarily to LG Home. Alternatively, hold OK for Control Center, then choose **Original LG Home**. To turn the takeover off persistently, use the dashboard's Home section and disable Glasshouse Home.

The screensaver has a separate selector: choose **LG default** in the dashboard's Screensaver section.

## Black or unresponsive Home

Keep the TV on and connect to its root shell. These commands stop the custom server, restore native Home through Glasshouse, then restart the dashboard with Home takeover disabled:

```sh
sh /var/lib/tvweb/tvwebctl stop
sh /var/lib/tvweb/tvwebctl restore-glasshouse-home
sh /var/lib/tvweb/tvwebctl start
```

Check each command's result. If native Home is restored, press Home again. Do not restart LG's application manager, remove system apps, or change HDMI/video drivers as a launcher repair.

## Restore the previous installed files

The latest backup ID is stored locally on the TV:

```sh
cat /var/lib/tvweb/rivera-interface-beta-last-backup
```

With the TV on, use that exact printed ID as `BACKUP_ID` below:

```sh
sh /var/lib/tvweb/tvwebctl stop
sh /var/lib/tvweb/tvwebctl restore-glasshouse-home
/usr/bin/node /var/lib/tvweb/rivera-interface-beta-installer.js restore BACKUP_ID
```

If `/var/lib/tvweb/tvwebctl` still exists after restoration, restart it:

```sh
sh /var/lib/tvweb/tvwebctl start
```

For an upgrade, the saved Home state and original boot hook return with the previous files. For a first install, payload files that did not exist before are removed. Logs, preferences created afterward and backup folders are intentionally retained; they can contain private information and should not be posted publicly.

The installer keeps each backup in `/var/lib/tvweb/backups/BACKUP_ID/` with checksums and `backup.json`. If the live helper is damaged, copy `tools/tv-install.js` from the extracted release to `/tmp/rivera-recover.js`, then run that copy with `restore BACKUP_ID`. Recovery does not require the dashboard to answer.

## If the TV cannot be reached

Confirm its current address, that the root SSH/telnet service is still enabled, and that the computer is on the same network. Firmware updates can remove root access. The release cannot repair unavailable root access or a native firmware failure. Follow the TV and Homebrew project's recovery instructions instead of deleting system files.
