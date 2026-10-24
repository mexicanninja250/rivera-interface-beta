/* Automatic approximate-location weather for the custom Home. No extra service.
 * Responses are cached in memory; network requests never block Home navigation.
 * Location comes from the public IP, not a precise device location. */
var https = require('https'), fs = require('fs'), path = require('path');
function settings() { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'home-weather.json'), 'utf8')); } catch (e) { return {}; } }
var cached = null, geo = null, geoAt = 0, weatherAt = 0, retryAt = 0, busy = false;

function json(url, cb) {
  var done = false, req;
  function finish(value) { if (done) return; done = true; cb(value); }
  try {
    req = https.get(url, function (res) {
      var parts = [], size = 0;
      if (res.statusCode !== 200) { res.resume(); return finish(null); }
      res.on('data', function (b) { size += b.length; if (size > 131072) { req.destroy(); return finish(null); } parts.push(b); });
      res.on('end', function () { var value = null; try { value = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (e) {} finish(value); });
      res.on('error', function () { finish(null); });
    });
    req.setTimeout(8000, function () { req.destroy(); finish(null); });
    req.on('error', function () { finish(null); });
  } catch (e) { finish(null); }
}
function refresh() {
  busy = true;
  function forecast() {
    if (!geo) { busy = false; retryAt = Date.now() + 300000; return; }
    var preferred = settings().unit;
    var unit = preferred === 'F' || (preferred !== 'C' && geo.countryCode === 'US') ? 'F' : 'C';
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + geo.lat + '&longitude=' + geo.lon + '&current=temperature_2m,weather_code,is_day&temperature_unit=' + (unit === 'F' ? 'fahrenheit' : 'celsius') + '&timezone=auto&forecast_days=1';
    json(url, function (r) {
      busy = false;
      if (!r || !r.current || typeof r.current.temperature_2m !== 'number') { retryAt = Date.now() + 300000; return; }
      weatherAt = Date.now();
      cached = { ok: true, city: geo.city, region: geo.region, country: geo.country, countryCode: geo.countryCode, temperature: r.current.temperature_2m, unit: unit, code: r.current.weather_code, isDay: !!r.current.is_day, updatedAt: weatherAt, location: 'Approximate internet location', attribution: 'Open-Meteo' };
    });
  }
  if (geo && Date.now() - geoAt < 43200000) return forecast();
  json('https://ipwho.is/?fields=success,city,region,country,country_code,latitude,longitude', function (r) {
    if (r && r.success && typeof r.latitude === 'number' && typeof r.longitude === 'number' && Math.abs(r.latitude) <= 90 && Math.abs(r.longitude) <= 180) {
      geo = { lat: r.latitude, lon: r.longitude, city: String(r.city || '').slice(0,80), region: String(r.region || '').slice(0,80), country: String(r.country || '').slice(0,80), countryCode: /^[A-Z]{2}$/.test(r.country_code) ? r.country_code : '' };
      geoAt = Date.now();
    }
    forecast();
  });
}
exports.current = function (cb) {
  if (settings().enabled === false) return cb({ok:true,available:false,disabled:true});
  var now = Date.now();
  if (!busy && now >= retryAt && (!cached || now - weatherAt >= 900000)) refresh();
  var result = cached || { ok: true, available: false, pending: busy };
  if (cached) result.stale = now - weatherAt > 3600000;
  cb(result);
};
