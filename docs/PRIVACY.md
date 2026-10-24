# Privacy and network services

The launcher runs on the TV and serves its dashboard on the local network. It has no Rivera account, analytics endpoint, subscription or advertising feed. The bundled Glasshouse dashboard includes broader controls; those features are governed by its local configuration and [upstream security guidance](https://rorygallagher2024.github.io/glasshouse/SECURITY/).

## Weather

Weather is enabled by default. The TV contacts `ipwho.is` to estimate the public IP's city, region, country and coordinates, then requests the current conditions from `api.open-meteo.com`. This is approximate IP location, not GPS; VPNs and some providers produce inaccurate locations. No exact street address or LG serial number is sent by this weather module.

Location is cached in memory for 12 hours; conditions for 15 minutes. Offline conditions can show as stale. Fahrenheit is selected for the United States, Celsius elsewhere.

Optional TV-local configuration at `/var/lib/tvweb/home-weather.json`:

```json
{"enabled": true, "unit": "C"}
```

Use `"F"` for Fahrenheit, or omit `unit` for automatic selection. To disable weather and its external requests, set `{"enabled":false}` and restart the server/Home page. This file is never included in the public bundle.

## Local headlines

Headlines are off by default. When enabled in Control Center, the TV requests a Google News RSS search using the detected city, region and country. It displays a small cached list of titles, publishers and dates, not article bodies. Refresh is limited to roughly 30 minutes. English-language results are requested; availability varies by region. Without a detected city, no location is invented and no local search runs.

## Show previews and local data

The starter catalogue is bundled with artwork and source links from TVmaze. Browsing it does not query a streaming account or know watch history. Recent-app previews, when available, come from the TV's local recent-app screenshots. They can show personal content; avoid including them in public screenshots.

Glasshouse configuration, app history, backups, logs, tokens and MQTT credentials stay on the TV. The release builder uses an explicit payload list and excludes local state. Do not upload the whole `/var/lib/tvweb` directory when reporting an issue.

## Network access

Port 8080 is unauthenticated by default. Other devices on the local network may be able to control the TV. Use a trusted LAN or Glasshouse's authentication options. Do not expose the dashboard, SSH or root telnet through internet port forwarding. Telnet is unencrypted; SSH is the preferred deployment transport.
