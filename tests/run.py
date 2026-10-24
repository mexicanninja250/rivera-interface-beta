from pathlib import Path
import os,subprocess,sys,tempfile,tarfile,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
node=os.environ.get('NODE','node')
def run(*args):subprocess.run(args,cwd=ROOT,check=True)
for file in ['check_home_relaunch_contract.cjs','check_entrance_readiness.cjs']:
    run(node,str(ROOT/'tests'/file),str(ROOT/'server/assets/home.html'))
for file in ['installer.cjs','regional.cjs','tabs.cjs','syntax.cjs']:run(node,str(ROOT/'tests'/file))
# ES5 syntax matters on the TV's server runtime. The Home browser is webOS 10;
# upstream's Chromium-38 CSS restrictions do not describe this release.
run(sys.executable,'tools/check-es5.py','server/tvweb.js',*[str(p.relative_to(ROOT)) for p in (ROOT/'server/lib').glob('*.js')],'tools/tv-install.js')
sys.path.insert(0,str(ROOT/'tools'))
from build import build,payload_files
from deploy import remote_script
with tempfile.TemporaryDirectory() as tmp:
    archive=Path(tmp)/'bundle.tar';digest,count=build(archive)
    with tarfile.open(archive) as t:
        m=json.load(t.extractfile('manifest.json'))
        assert len(m['files'])==count
        for f in m['files']:assert hashlib.sha256(t.extractfile(f['path']).read()).hexdigest()==f['sha256']
        assert not any(x in t.getnames() for x in ['config.json','home.json','home-weather.json','home-ambient.json'])
        for f in ['assets/tvos/logos.js','assets/tvos/fjord-sharp.png','assets/tvos/shows.json','assets/screensavers/aerial.qml','lib/home-weather.js','lib/home-ambient.js']:assert f in t.getnames(),f
    assert digest==hashlib.sha256(archive.read_bytes()).hexdigest()
    script=remote_script('/tmp/rivera-test',digest,'rivera-test',True)
    assert script.index('GLASS_HOME_CHECK_COMPLETE; exit 0')<script.index(' backup ')
print('All checks passed; package paths, checksums and no-install preflight verified.')
