#!/usr/bin/env python3
"""Loopback-only profile/image fixture for native dock avatar QA.
Synthetic identity/image; no real user data, credentials or provider requests.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Lock

# Tiny deterministic PNG with a distinct teal center to distinguish the account
# photo from the purple Trisha asset. Use only as clearly labeled synthetic QA.
import struct
import zlib

def png():
    side = 96
    pixels = b''.join(b'\x00' + bytes([18, 166, 147, 255])*side for _ in range(side))
    def chunk(kind, data):
        return struct.pack('!I',len(data)) + kind + data + struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('!2I5B',side,side,8,6,0,0,0)) + chunk(b'IDAT',zlib.compress(pixels)) + chunk(b'IEND',b'')

image = png()
lock = Lock()
state = {'userId':12, 'name':'Morgan Ellis (Fixture)', 'image':'/avatar.png', 'expired':False, 'requests':[]}
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass
    def send(self,status,body,kind='application/json'):
        if isinstance(body,dict):
            body = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type',kind)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','private, no-store')
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if self.path == '/__health':
            return self.send(200,{'fixtureOnly':True})
        if self.path == '/__state':
            return self.send(200,state)
        cookie = self.headers.get('Cookie','')
        with lock:
            state['requests'].append({'path':self.path, 'cookiePresent':bool(cookie), 'authorizationPresent':bool(self.headers.get('Authorization'))})
        if self.path == '/avatar.png':
            # Image must never inherit application auth credentials.
            if cookie or self.headers.get('Authorization'):
                return self.send(400,{'error':'Image received credentials'})
            return self.send(200,image,'image/png')
        authorized = not state['expired'] and any(token in cookie for token in [
            'next-auth.session-token=local-avatar-fixture', 'next-auth.session-token=local-ui-fixture'])
        if self.path == '/api/mobile/dashboard':
            if not authorized:
                return self.send(401,{'error':'Unauthorized synthetic fixture'})
            data = json.loads((Path(__file__).resolve().parents[1]/'tests/fixtures/native-rentals-dashboard.json').read_text())
            data['scope']['userId'] = state['userId']
            return self.send(200,data)
        if self.path == '/api/user/profile':
            if not authorized:
                return self.send(401,{'error':'Unauthorized synthetic fixture'})
            return self.send(200,{'user':{'id':state['userId'],'name':state['name'],'image':state['image'],
                'email':'morgan@example.test','phone':None,'emailVerified':True,'roles':['vendor'],
                'vendor':{'id':29,'businessName':'Synthetic avatar workspace'},'vendorPermissions':{'dashboard':True,'profile':True,'aiAssistant':True}},
                'capabilities':{'calls':True}})
        if self.path.startswith('/vendor/profile?view=account'):
            if not authorized:
                return self.send(401,{'error':'Unauthorized synthetic fixture'})
            html = '''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{color-scheme:light dark}body{font:20px -apple-system;padding:24px}</style></head><body><h1>Synthetic native-dock fixture</h1><p>Native UIKit controls below are authenticated through the profile API. No user data is included in the navigation payload.</p><script>
            const state={version:1,context:'avatar-fixture',revision:1,visible:true,appearance:'light',tabs:[
              {id:'vendor-assistant',label:'Assistant',icon:'assistant',badge:0,selected:false,items:[]},
              {id:'vendor-account',label:'Account',icon:'account',badge:0,selected:true,items:[{id:'vendor-profile',label:'Profile',icon:'profile'}]}]};
            let sent=false;const ready=setInterval(()=>{if(!sent&&window.Capacitor?.nativePromise){sent=true;window.Capacitor.nativePromise('TrashedNavigation','setState',state).catch(()=>{sent=false});clearInterval(ready)}},100);
            </script></body></html>'''
            return self.send(200,html.encode(),'text/html')
        return self.send(404,{'error':'Unknown fixture path'})
    def do_POST(self):
        if self.path == '/api/vendor/push-token':
            data = json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
            with lock:
                state['requests'].append({'path':self.path,'fields':sorted(data),'fixtureOnly':True})
            return self.send(200,{'ok':True,'fenced':bool(data.get('registrationId'))})
        if self.path != '/__control':
            return self.send(404,{})
        size = int(self.headers.get('Content-Length','0'))
        if size < 0 or size > 4096:
            return self.send(400,{})
        data = json.loads(self.rfile.read(size))
        with lock:
            for key in ['userId','name','image','expired']:
                if key in data:
                    state[key] = data[key]
        self.send(200,{'fixtureOnly':True})

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=3424)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Local synthetic dock avatar fixture on 127.0.0.1:{server.server_port}',flush=True)
    server.serve_forever()
