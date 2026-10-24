const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../server/assets/home.html'),'utf8');
const fn=html.match(/^function changeTab\(n\).*$/m)[0];
for(const next of [0,1,2]){
 const elements={showHint:{textContent:'Browse shows'},showShelf:{innerHTML:'old cards'}};
 const c={tab:0,page:2,index:8,heroId:'app:netflix',showTimer:12,showLoadToken:4,showList:[{}],showReady:true,clearTimeout:()=>{},$:id=>elements[id],makeView(){c.rendered=true},openSearch(){}};
 vm.createContext(c);vm.runInContext(fn+';changeTab('+next+')',c);
 assert.equal(c.tab,next);assert.equal(c.heroId,'');assert.equal(c.showLoadToken,5);assert.equal(c.showList.length,0);assert.equal(elements.showHint.textContent,'');assert.equal(elements.showShelf.innerHTML,'');assert(c.rendered);
}
console.log('Switching sections clears stale featured cards and refreshes the hero.');
