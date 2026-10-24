const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert'),EventEmitter=require('events');
const base=path.join(__dirname,'../server/lib');
function weather(country,config={}){
 const requests=[],jobs=[];
 const fakeHttps={get(url,fn){requests.push(url);const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};jobs.push(()=>{const res=new EventEmitter();res.statusCode=200;res.resume=()=>{};fn(res);res.emit('data',Buffer.from(JSON.stringify(url.includes('ipwho.is')?{success:true,city:'Example City',region:'Example Region',country:'Example Country',country_code:country,latitude:40,longitude:10}:{current:{temperature_2m:20,weather_code:0,is_day:1}})));res.emit('end')});return req}};
 const mod={exports:{}},ctx={module:mod,exports:mod.exports,Buffer,Date,__dirname:base,require(name){if(name==='https')return fakeHttps;if(name==='fs')return {readFileSync(){return JSON.stringify(config)}};return require(name)}};
 vm.runInNewContext(fs.readFileSync(path.join(base,'home-weather.js'),'utf8'),ctx);
 let result;mod.exports.current(r=>result=r);while(jobs.length)jobs.shift()();mod.exports.current(r=>result=r);return {result,requests};
}
assert.equal(weather('US').result.unit,'F');assert.equal(weather('GB').result.unit,'C');assert.equal(weather('US',{unit:'C'}).result.unit,'C');assert.equal(weather('GB',{unit:'F'}).result.unit,'F');assert.equal(weather('US',{enabled:false}).requests.length,0);
const w=weather('CA');assert.equal(w.result.countryCode,'CA');assert(w.requests[1].includes('temperature_unit=celsius'));
function news(pref,w){const requests=[],mod={exports:{}};const fakeFs={readFileSync(){if(pref===null)throw Error('missing');return JSON.stringify(pref)}};const fakeHttps={get(url){requests.push(url);throw Error('offline')}};const ctx={module:mod,exports:mod.exports,Buffer,Date,__dirname:base,require(name){if(name==='https')return fakeHttps;if(name==='fs')return fakeFs;if(name==='./home-weather')return {current(cb){cb(w)}};return require(name)}};vm.runInNewContext(fs.readFileSync(path.join(base,'home-ambient.js'),'utf8'),ctx);let result;mod.exports.current(r=>result=r);return {result,requests}}
assert.equal(news(null,w.result).requests.length,0);assert.equal(news({news:true},{ok:true,pending:true}).requests.length,0);
const n=news({news:true},w.result);assert.equal(n.requests.length,1);assert(n.requests[0].includes('gl=CA'));assert(decodeURIComponent(n.requests[0]).includes('Example City, Example Region, Example Country'));assert.equal(n.result.newsEnabled,true);
assert.equal(news({news:true},{disabled:true}).requests.length,0);
console.log('Regional weather, units, privacy switches, absent location and offline news tests passed.');
