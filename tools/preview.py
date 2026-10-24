"""Local, offline UI demo with sample apps/weather. Never contacts a TV."""
import http.server,json,mimetypes,urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'server/assets'
APPS=[('netflix','Netflix'),('amazon','Prime Video'),('com.disney.disneyplus-prod','Disney+'),('youtube.leanback.v4','YouTube'),('com.apple.appletv','Apple TV'),('hulu','Hulu'),('com.wbd.stream','HBO Max'),('com.crunchyroll.webapp','Crunchyroll'),('com.peacock.tv','Peacock'),('com.plexapp.plex','Plex'),('com.webos.app.browser','Web Browser'),('com.webos.app.mediadiscovery','Media Player')]
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        route=urllib.parse.urlsplit(self.path).path
        data={'ok':True}
        if route=='/api/home/catalogue':data.update(apps=[{'id':i,'title':t} for i,t in APPS],devices=[{'id':'HDMI_'+str(n),'name':name,'port':n,'unused':False} for n,name in [(1,'Xbox'),(2,'HDMI 2'),(3,'PC'),(4,'HDMI 4')]],layoutVersion='sample')
        elif route=='/api/home/weather':data.update(temperature=21,unit='C',city='Sample City',code=0)
        elif route=='/api/home/recents':data['apps']=[]
        elif route=='/api/home/ambient':data.update(newsEnabled=False,headlines=[])
        elif route=='/api/home/experience':data.update(awake=True,wakeToken='sample')
        elif route.startswith('/api/'):return self.send_error(404)
        else:
            relative='home.html' if route in ('/','/home.html') else route.removeprefix('/assets/')
            file=(ROOT/relative).resolve()
            if ROOT.resolve() not in file.parents or not file.is_file():return self.send_error(404)
            return self.respond(file.read_bytes(),mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
        self.respond(json.dumps(data).encode(),'application/json')
    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length','0')))
        self.respond(b'{"ok":true,"build":"demo"}','application/json')
    def respond(self,body,mime):
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def log_message(self,*_):pass
if __name__=='__main__':
    print('Offline demo: http://127.0.0.1:8766/?preview=1',flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1',8766),Handler).serve_forever()
