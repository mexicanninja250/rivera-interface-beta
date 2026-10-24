const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');let count=0;
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(p.endsWith('.js')){new vm.Script(fs.readFileSync(p,'utf8'),{filename:p});count++;}else if(p.endsWith('.html')){const s=fs.readFileSync(p,'utf8');for(const m of s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)){if(m[1].trim()){new vm.Script(m[1],{filename:p});count++;}}}}}
walk(path.join(root,'server'));new vm.Script(fs.readFileSync(path.join(root,'tools/tv-install.js'),'utf8'));console.log(count+' server/page scripts parse successfully.');
