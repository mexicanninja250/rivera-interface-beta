// Local weather and a small, attributed RSS headline cache. No article bodies.
var https=require('https'),fs=require('fs'),path=require('path'),weather=require('./home-weather');
var pref=path.join(__dirname,'..','home-ambient.json'),cached=null,last=0,busy=false,retry=0,cacheRegion='';
function settings(){try{return JSON.parse(fs.readFileSync(pref,'utf8'));}catch(e){return {news:false};}}
function clean(s){return String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(+n);}).trim();}
function refresh(w){
  if(!w.city)return;
  var region=[w.city,w.region,w.country].filter(function(v){return !!v;}).join(', ');
  if(region!==cacheRegion){cached=null;last=0;retry=0;cacheRegion=region;}
  if(busy||Date.now()<retry||Date.now()-last<1800000)return;
  busy=true;var parts=[],bytes=0,done=false;
  function finish(){if(done)return;done=true;busy=false;retry=Date.now()+300000;}
  var country=/^[A-Z]{2}$/.test(w.countryCode)?w.countryCode:'US';
  var url='https://news.google.com/rss/search?q='+encodeURIComponent(region+' when:7d')+'&hl=en-US&gl='+country+'&ceid='+country+':en';
  var req;
  try{req=https.get(url,function(res){
    if(res.statusCode!==200){res.resume();return finish();}
    res.on('data',function(b){bytes+=b.length;if(bytes>512000){req.destroy();return finish();}parts.push(b);});
    res.on('error',finish);
    res.on('end',function(){if(done)return;var xml=Buffer.concat(parts).toString('utf8'),items=[],re=/<item>([\s\S]*?)<\/item>/g,m;
      while((m=re.exec(xml))&&items.length<6){var item=m[1];function tag(n){var x=new RegExp('<'+n+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+n+'>').exec(item);return clean(x?x[1]:'');}
        var title=tag('title'),source=tag('source'),date=tag('pubDate'),at=Date.parse(date),link=tag('link');
        if(title&&at&&Date.now()-at<8*86400000&&/^https:\/\//.test(link))items.push({title:title.slice(0,180),source:source.slice(0,60),publishedAt:at,url:link});
      }
      if(items.length){cached=items;last=Date.now();}finish();
    });
  });req.setTimeout(8000,function(){req.destroy();finish();});req.on('error',finish);}catch(e){finish();}
}
exports.current=function(cb){weather.current(function(w){var p=settings();if(p.news===true&&!w.disabled)refresh(w);cb({ok:true,weather:w,newsEnabled:p.news===true,headlines:p.news===true&&!w.disabled?cached||[]:[],newsUpdatedAt:last,newsStale:Date.now()-last>3600000,region:[w.city,w.region,w.country].filter(function(v){return !!v;}).join(', ')});});};
exports.set=function(body,cb){if(!body||typeof body.news!=='boolean')return cb({ok:false,error:'news must be true or false'});try{fs.writeFileSync(pref+'.new',JSON.stringify({news:body.news}));fs.renameSync(pref+'.new',pref);cb({ok:true,newsEnabled:body.news});}catch(e){cb({ok:false,error:'Could not save news preference'});}};
