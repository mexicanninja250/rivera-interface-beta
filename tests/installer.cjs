const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const create=require('../tools/tv-install').create;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rivera-test-'));
function digest(b){return crypto.createHash('sha256').update(b).digest('hex')}
function setup(name){
 const base=path.join(dir,name),root=path.join(base,'tvweb'),payload=path.join(base,'payload'),boot=path.join(base,'boot','50-tvweb');
 fs.mkdirSync(root,{recursive:true});fs.mkdirSync(payload,{recursive:true});fs.mkdirSync(path.dirname(boot),{recursive:true});
 fs.writeFileSync(path.join(root,'tvweb.js'),'old-server');fs.writeFileSync(path.join(root,'home.json'),'{"enabled":true}');fs.writeFileSync(boot,'old-hook');
 const names=['tvweb.js','tvwebctl','assets/home.html','lib/home.js','lib/home-takeover.js','50-tvweb.sh','rivera-interface-beta.json','rivera-interface-beta-installer.js'];
 const m={name:'Rivera Interface Beta',files:names.map((name)=>{const body='new-'+name;const f=path.join(payload,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,body);return {path:name,sha256:digest(body),mode:420}})};
 function manifest(){fs.writeFileSync(path.join(payload,'manifest.json'),JSON.stringify(m))}manifest();
 return {base,root,payload,boot,m,manifest,app:create({root,boot})};
}
try{
 let s=setup('roundtrip');s.app.backup(s.payload,'before');s.app.install(s.payload,'before');assert.equal(fs.readFileSync(path.join(s.root,'tvweb.js'),'utf8'),'new-tvweb.js');s.app.restore('before');assert.equal(fs.readFileSync(path.join(s.root,'tvweb.js'),'utf8'),'old-server');assert.equal(fs.readFileSync(s.boot,'utf8'),'old-hook');assert(!fs.existsSync(path.join(s.root,'assets/home.html')));
 s=setup('failure');s.app.backup(s.payload,'before');s.app=create({root:s.root,boot:s.boot,beforeWrite(i){if(i===4)throw Error('forced write failure')}});assert.throws(()=>s.app.install(s.payload,'before'),/previous files restored/);assert.equal(fs.readFileSync(path.join(s.root,'tvweb.js'),'utf8'),'old-server');assert(!fs.existsSync(path.join(s.root,'assets/home.html')));
 s=setup('corrupt');fs.writeFileSync(path.join(s.payload,'assets/home.html'),'corrupt');assert.throws(()=>s.app.backup(s.payload,'before'),/Checksum failed/);assert(!fs.existsSync(path.join(s.root,'backups/before')));
 s=setup('traversal');s.m.files[0].path='../escape';s.manifest();assert.throws(()=>s.app.verify(s.payload),/Unexpected package path/);
 s=setup('duplicate');s.m.files.push(s.m.files[0]);s.manifest();assert.throws(()=>s.app.verify(s.payload),/Unexpected package path/);
 s=setup('backup-check');s.app.backup(s.payload,'before');s.app.install(s.payload,'before');fs.writeFileSync(path.join(s.root,'backups/before/file-0'),'tampered');assert.throws(()=>s.app.restore('before'),/Backup checksum failed/);assert.equal(fs.readFileSync(path.join(s.root,'tvweb.js'),'utf8'),'new-tvweb.js');
 if(process.platform!=='win32'){s=setup('symlink');fs.mkdirSync(path.join(s.root,'lib'));fs.symlinkSync(path.join(s.base,'outside'),path.join(s.root,'lib/home.js'));assert.throws(()=>s.app.verify(s.payload),/Symlink|ENOENT/);}
 console.log('Installer roundtrip, rollback, checksum, traversal, duplicate and backup-integrity tests passed.');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
