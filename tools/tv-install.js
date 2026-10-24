/* Transactional file installer for the pinned Rivera Interface Beta payload. ES5. */
'use strict';
var fs=require('fs'),path=require('path'),crypto=require('crypto');
function mkdir(p){if(fs.existsSync(p))return;mkdir(path.dirname(p));fs.mkdirSync(p);}
function safe(p){return typeof p==='string'&&/^[a-zA-Z0-9_.\/-]+$/.test(p)&&p.charAt(0)!=='/'&&p.split('/').every(function(s){return s&&s!=='.'&&s!=='..';});}
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function stat(p){try{return fs.lstatSync(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function create(options){
  var root=options.root||'/var/lib/tvweb',boot=options.boot||'/var/lib/webosbrew/init.d/50-tvweb';
  function target(name){if(name==='@boot')return boot;if(!safe(name))throw Error('Invalid target path');return path.join(root,name);}
  function ordinary(file,base){
    var parent=file;
    while(parent.length>=base.length){var s=stat(parent);if(s&&s.isSymbolicLink())throw Error('Symlink refused: '+parent);if(parent===base)break;parent=path.dirname(parent);}
    if(fs.existsSync(file)&&!fs.statSync(file).isFile())throw Error('Target is not a regular file: '+file);
  }
  function write(file,data,mode){mkdir(path.dirname(file));var tmp=file+'.rivera-interface-beta-new',s=stat(tmp);if(s&&s.isSymbolicLink())throw Error('Symlink staging file refused');fs.writeFileSync(tmp,data);fs.chmodSync(tmp,mode);fs.renameSync(tmp,file);}
  function verify(payload){
    var m=JSON.parse(fs.readFileSync(path.join(payload,'manifest.json'),'utf8'));
    if(m.name!=='Rivera Interface Beta'||!Array.isArray(m.files)||!m.files.length)throw Error('Invalid package manifest');
    var seen={};
    m.files.forEach(function(f){
      if(!safe(f.path)||seen[f.path]||!(/^(assets\/|lib\/)/.test(f.path)||['tvweb.js','tvwebctl','50-tvweb.sh','rivera-interface-beta.json','rivera-interface-beta-installer.js'].indexOf(f.path)>=0))throw Error('Unexpected package path: '+f.path);
      if(!/^[0-9a-f]{64}$/.test(f.sha256)||[420,493].indexOf(f.mode)<0)throw Error('Invalid package file metadata');
      seen[f.path]=true;
      var source=path.join(payload,f.path);ordinary(source,payload);if(sha(source)!==f.sha256)throw Error('Checksum failed: '+f.path);
      var dest=target(f.path==='50-tvweb.sh'?'@boot':f.path);ordinary(dest,f.path==='50-tvweb.sh'?path.dirname(boot):root);
    });
    ['tvweb.js','tvwebctl','assets/home.html','lib/home.js','lib/home-takeover.js','50-tvweb.sh','rivera-interface-beta.json','rivera-interface-beta-installer.js'].forEach(function(f){if(!seen[f])throw Error('Missing required file: '+f);});
    return m;
  }
  function backup(payload,id){
    var m=verify(payload),dir=path.join(root,'backups',id);
    if(!/^[a-zA-Z0-9_-]+$/.test(id)||fs.existsSync(dir))throw Error('Backup name is invalid or already exists');
    mkdir(dir);fs.chmodSync(dir,448);
    var names=m.files.map(function(f){return f.path==='50-tvweb.sh'?'@boot':f.path;});
    // These state files belong to Home, which is disabled during installation.
    names.push('home.json','home-startup-enabled');
    var entries=names.map(function(name,i){var file=target(name);ordinary(file,name==='@boot'?path.dirname(boot):root);var e={path:name,exists:fs.existsSync(file),saved:'file-'+i};if(e.exists){e.mode=fs.statSync(file).mode&511;write(path.join(dir,e.saved),fs.readFileSync(file),384);e.sha256=sha(file);}return e;});
    fs.writeFileSync(path.join(dir,'backup.json'),JSON.stringify({format:1,files:entries},null,2));
    write(path.join(root,'rivera-interface-beta-last-backup'),new Buffer(id+'\n'),384);
    return dir;
  }
  function restore(id){
    if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid backup name');
    var dir=path.join(root,'backups',id),b=JSON.parse(fs.readFileSync(path.join(dir,'backup.json'),'utf8'));
    if(b.format!==1||!Array.isArray(b.files))throw Error('Invalid backup metadata');
    b.files.forEach(function(e){var dest=target(e.path);ordinary(dest,e.path==='@boot'?path.dirname(boot):root);if(!/^file-\d+$/.test(e.saved))throw Error('Invalid backup entry');if(e.exists&&sha(path.join(dir,e.saved))!==e.sha256)throw Error('Backup checksum failed');});
    b.files.forEach(function(e){var file=target(e.path);if(e.exists)write(file,fs.readFileSync(path.join(dir,e.saved)),e.mode);else if(fs.existsSync(file))fs.unlinkSync(file);});
    return dir;
  }
  function install(payload,id){
    var m=verify(payload),dir=path.join(root,'backups',id);
    if(!fs.existsSync(path.join(dir,'backup.json')))throw Error('A verified backup is required before installation');
    try{m.files.forEach(function(f,i){if(options.beforeWrite)options.beforeWrite(i);write(target(f.path==='50-tvweb.sh'?'@boot':f.path),fs.readFileSync(path.join(payload,f.path)),f.mode);});}
    catch(e){restore(id);throw Error('Install failed; previous files restored: '+e.message);}
    return dir;
  }
  return {verify:verify,backup:backup,install:install,restore:restore};
}
function checkHost(){
  if(!process.getuid||process.getuid()!==0)throw Error('A root TV shell is required');
  var issue=fs.readFileSync('/etc/issue','utf8');
  if(!/webOS[^\n]*\b10\./i.test(issue))throw Error('This preview release supports webOS 10 only');
  var root='/var/lib/tvweb';
  if(fs.existsSync(path.join(root,'.from-homebrew-channel')))throw Error('Homebrew Channel-managed Glasshouse must be removed or migrated using its upstream instructions first');
  var config={};try{config=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(config.port&&config.port!==8080)throw Error('This preview requires the dashboard on port 8080');
  if(config.web&&config.web.enabled===false)throw Error('Enable the Glasshouse web server before installing');
  var home={};try{home=JSON.parse(fs.readFileSync(path.join(root,'home.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(home.hideLgHomeAtStart===true)throw Error('Turn off Hide LG Home at startup before installing, to retain the native fallback');
  return true;
}
module.exports={create:create,checkHost:checkHost};
if(require.main===module){
  try{
    var action=process.argv[2],payload=process.argv[3],id=process.argv[4],app=create({});
    // Recovery must still work after a firmware change or a failed migration.
    if(!process.getuid||process.getuid()!==0)throw Error('A root TV shell is required');
    if(action!=='restore')checkHost();
    if(action==='check'){app.verify(payload);console.log('GLASS_HOME_CHECK_OK');}
    else if(action==='backup')console.log(app.backup(payload,id));
    else if(action==='install')console.log(app.install(payload,id));
    else if(action==='restore')console.log(app.restore(payload));
    else throw Error('Expected check, backup, install or restore');
  }catch(e){console.error(e.message);process.exit(1);}
}
