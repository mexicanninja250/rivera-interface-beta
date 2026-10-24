"""Build an allowlisted, checksum-verified TV payload; never copy local settings."""
from pathlib import Path
import hashlib,json,tarfile,io,sys
ROOT=Path(__file__).resolve().parents[1]
def payload_files():
    base=ROOT/'server'
    files={p.relative_to(base).as_posix():p.read_bytes() for branch in ['assets','lib'] for p in (base/branch).rglob('*') if p.is_file() and not p.is_symlink()}
    for name in ['tvweb.js','tvwebctl','50-tvweb.sh','rivera-interface-beta.json']:files[name]=(base/name).read_bytes()
    files['rivera-interface-beta-installer.js']=(ROOT/'tools/tv-install.js').read_bytes()
    for name in files:
        if name.endswith(('.js','.html','.sh','.css','.json','.qml','.txt')) or name=='tvwebctl':files[name]=files[name].replace(b'\r\n',b'\n')
    return files
def build(destination):
    files=payload_files();version=json.loads(files['rivera-interface-beta.json'])['version']
    manifest={'name':'Rivera Interface Beta','version':version,'files':[{'path':name,'sha256':hashlib.sha256(body).hexdigest(),'mode':493 if name in ['tvwebctl','50-tvweb.sh'] else 420} for name,body in sorted(files.items())]}
    files['manifest.json']=(json.dumps(manifest,indent=2)+'\n').encode()
    destination=Path(destination);destination.parent.mkdir(parents=True,exist_ok=True)
    with tarfile.open(destination,'w',format=tarfile.USTAR_FORMAT) as tar:
        for name,body in sorted(files.items()):
            item=tarfile.TarInfo(name);item.size=len(body);item.mode=0o644;item.mtime=0;tar.addfile(item,io.BytesIO(body))
    return hashlib.sha256(destination.read_bytes()).hexdigest(),len(manifest['files'])
if __name__=='__main__':
    dest=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'dist/rivera-interface-beta-tv.tar'
    digest,count=build(dest);print(f'{count} payload files; SHA256 {digest}\n{dest}')
