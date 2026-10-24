"""Deploy from Windows/macOS/Linux using OpenSSH, or explicit root telnet."""
import argparse,base64,hashlib,os,re,secrets,socket,subprocess,tempfile,threading,time
from pathlib import Path
from build import build,ROOT

def remote_script(stage,digest,backup,check):
    script=r'''set -eu
S=STAGE
D=/var/lib/tvweb
B=BACKUP
trap 'rm -rf "$S"' EXIT
cd "$S"
echo 'DIGEST  bundle.tar' | sha256sum -c -
mkdir payload
tar -xf bundle.tar -C payload
I="$S/payload/rivera-interface-beta-installer.js"
/usr/bin/node "$I" check "$S/payload"
CHECK_ONLY
free=$(df -Pk /var/lib | tail -1 | awk '{print $4}')
[ "$free" -ge 131072 ] || { echo 'At least 128 MiB free in /var/lib is required'; exit 1; }
/usr/bin/node "$I" backup "$S/payload" "$B"
echo "Recovery backup: $D/backups/$B"
if [ -f "$D/tvwebctl" ]; then
  sh "$D/tvwebctl" stop
  if ! sh "$D/tvwebctl" restore-glasshouse-home; then
    sh "$D/tvwebctl" start || true
    echo 'LG Home could not be restored; installation stopped before replacing files'
    exit 1
  fi
fi
if ! /usr/bin/node "$I" install "$S/payload" "$B"; then
  [ ! -f "$D/tvwebctl" ] || sh "$D/tvwebctl" start
  exit 1
fi
if ! sh "$D/tvwebctl" start; then
  sh "$D/tvwebctl" stop || true
  /usr/bin/node "$I" restore "$B"
  [ ! -f "$D/tvwebctl" ] || sh "$D/tvwebctl" start
  echo 'Server failed to start; previous files restored'
  exit 1
fi
healthy=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if /usr/bin/node -e 'var h=require("http"),r=h.get("http://127.0.0.1:8080/api/caps",function(s){s.resume();process.exit(s.statusCode===200||s.statusCode===401?0:1)});r.on("error",function(){process.exit(1)});r.setTimeout(2000,function(){process.exit(1)})'; then healthy=1; break; fi
  sleep 2
done
if [ "$healthy" -ne 1 ]; then
  sh "$D/tvwebctl" stop || true
  /usr/bin/node "$I" restore "$B"
  [ ! -f "$D/tvwebctl" ] || sh "$D/tvwebctl" start
  echo 'Server health check failed; previous files restored'
  exit 1
fi
echo GLASS_HOME_INSTALLED
echo 'Open the dashboard, preview Home, then enable Home takeover when ready.'
'''
    return script.replace('STAGE',stage).replace('BACKUP',backup).replace('DIGEST',digest).replace('CHECK_ONLY',"echo GLASS_HOME_CHECK_COMPLETE; exit 0" if check else '')

def ssh_run(tv,port,tar,script,stage):
    args=['ssh','-p',str(port),'-o','ConnectTimeout=10','-o','StrictHostKeyChecking=accept-new','root@'+tv]
    with open(tar,'rb') as body:
        subprocess.run(args+['mkdir -p '+stage+' && cat > '+stage+'/bundle.tar'],stdin=body,check=True)
    subprocess.run(args+['sh -s'],input=script.encode(),check=True)

def telnet_run(tv,port,tar,script,stage):
    # Homebrew Channel's root telnet shell has no login negotiation. No
    # passwords or tokens are accepted by this transport.
    output=bytearray();finished=threading.Event()
    with socket.create_connection((tv,port),timeout=10) as s:
        s.settimeout(1)
        def read():
            while not finished.is_set():
                try:
                    chunk=s.recv(65536)
                    if not chunk:break
                    output.extend(chunk)
                except socket.timeout:continue
                except OSError:break
        worker=threading.Thread(target=read,daemon=True);worker.start()
        s.sendall(b"PS1=; PS2=; stty -echo; printf '\\nRIVERA_READY\\n'\n")
        limit=time.monotonic()+10
        while b'RIVERA_READY\r\n' not in output and b'RIVERA_READY\n' not in output:
            if time.monotonic()>limit:finished.set();raise RuntimeError('No root shell marker; use SSH or enable the Homebrew root telnet shell')
            time.sleep(.1)
        output.clear()
        s.sendall(('mkdir -p '+stage+" && base64 -d > "+stage+"/bundle.tar <<'RIVERA_PAYLOAD_END'\n").encode())
        with open(tar,'rb') as f:
            while True:
                block=f.read(57*128)
                if not block:break
                s.sendall(base64.encodebytes(block))
        s.sendall(("RIVERA_PAYLOAD_END\ncat > "+stage+"/install.sh <<'RIVERA_SCRIPT_END'\n"+script+"\nRIVERA_SCRIPT_END\nsh "+stage+"/install.sh; result=$?; printf '\\nRIVERA_DONE:%s\\n' \"$result\"; exit\n").encode())
        limit=time.monotonic()+180
        while not re.search(rb'RIVERA_DONE:\d+',output):
            if time.monotonic()>limit:finished.set();raise RuntimeError('TV did not confirm completion; inspect the backup and TV log before retrying')
            time.sleep(.2)
        finished.set();worker.join(timeout=2)
    clean=bytes(c for c in output if c in (9,10,13) or 32<=c<127).decode()
    print(clean)
    if not re.search(r'RIVERA_DONE:0\b',clean):raise RuntimeError('The TV rejected or rolled back the installation')

def main():
    p=argparse.ArgumentParser(description='Install Rivera Interface Beta on a rooted webOS 10 TV. Root SSH is the default.')
    p.add_argument('tv',nargs='?',help='TV IP address or hostname')
    p.add_argument('--telnet',action='store_true',help='Use the unauthenticated Homebrew root shell on the trusted local network')
    p.add_argument('--port',type=int,help='SSH port (default 22), or telnet port (default 23)')
    p.add_argument('--check',action='store_true',help='Transfer and verify prerequisites only; do not install')
    p.add_argument('--dry-run',action='store_true',help='Build and validate the local package without contacting a TV')
    args=p.parse_args()
    if not args.dry_run and (not args.tv or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.:-]*',args.tv)):p.error('A valid TV address is required')
    if args.port is not None and not 1<=args.port<=65535:p.error('Invalid port')
    with tempfile.TemporaryDirectory(prefix='rivera-build-') as folder:
        archive=Path(folder)/'bundle.tar';digest,count=build(archive)
        print(f'Package: {count} files, {archive.stat().st_size/1048576:.1f} MiB; SHA256 {digest}',flush=True)
        if args.dry_run:return
        ident='rivera-interface-beta-'+time.strftime('%Y%m%d-%H%M%S')+'-'+secrets.token_hex(3)
        stage='/tmp/'+ident;script=remote_script(stage,digest,ident,args.check)
        if args.telnet:telnet_run(args.tv,args.port or 23,archive,script,stage)
        else:ssh_run(args.tv,args.port or 22,archive,script,stage)
        print(('Preflight passed. ' if args.check else 'Installation verified. ')+f'Dashboard: http://{args.tv}:8080/',flush=True)
if __name__=='__main__':main()
