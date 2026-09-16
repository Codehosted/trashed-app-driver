#!/usr/bin/env python3
"""Loopback-only, synthetic HTTP fixtures for native account/calls UI tests.
No database/provider credentials or production data. Start with --port 3421.
"""
import argparse, io, json, math, struct, threading, wave
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

state={'name':'Morgan Ellis (Fixture)','email':'morgan@example.test','phone':'+15555550123','userId':12,'failSave':False,'expired':False,'requests':[]}
lock=threading.Lock()
def profile():
    return {'user':{'id':state['userId'],'name':state['name'],'email':state['email'],'phone':state['phone'],'image':None,'emailVerified':True,'roles':['vendor'],'vendor':{'id':29,'businessName':'Local fixture workspace'},'vendorPermissions':{'callCenter':True,'settings':True}},'capabilities':{'calls':True}}
def calls(page,search):
    names=['Avery Taylor','Jordan Parker','Riley Morgan','Casey Blair','Drew Bennett','Quinn Lee','Cameron Reed','Hayden Ross','Reese Ward','Alex Rivera','Emerson Hayes','Jamie Brooks']
    rows=[{'id':f'fixture-call-{i+1}','callId':f'fixture-call-{i+1}','customerName':name+' (Fixture)','customerPhone':'+15555550123','duration':20,'durationFormatted':'0:20','status':'ended','timestamp':'2026-09-16T11:00:00Z','transcript':'Caller: I need a container for a weekend cleanup.\nTrisha: I can help with sizes and availability.\nCaller: A twenty yard container would be ideal.\nTrisha: Let’s check the dates and delivery details.\n\nSynthetic local transcript. No customer call was used.','hasRecording':True,'recordingUrl':f'/api/calls/fixture-call-{i+1}/recording','customerSatisfaction':9} for i,name in enumerate(names)]
    if search:rows=[row for row in rows if search.lower() in row['customerName'].lower()]
    return {'calls':rows[(page-1)*10:page*10],'totalCalls':len(rows),'totalPages':math.ceil(len(rows)/10),'currentPage':page}
def audio():
    out=io.BytesIO()
    with wave.open(out,'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000)
        wav.writeframes(b''.join(struct.pack('<h',int(120*math.sin(2*math.pi*330*i/8000))) for i in range(160000)))
    return out.getvalue()
audio_bytes=audio()
class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):pass
    def send(self,status,body,content_type='application/json'):
        if isinstance(body,dict):body=json.dumps(body).encode()
        self.send_response(status);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','private, no-store');self.end_headers();self.wfile.write(body)
    def do_GET(self):
        url=urlparse(self.path)
        if url.path=='/__health':return self.send(200,{'fixtureOnly':True})
        if url.path=='/__state':return self.send(200,state)
        with lock:state['requests'].append({'method':'GET','path':self.path,'authenticated':self.headers.get('Cookie','').find('next-auth.session-token=local-ui-fixture')>=0})
        if state['expired'] or 'next-auth.session-token=local-ui-fixture' not in self.headers.get('Cookie',''):return self.send(401,{'error':'Unauthorized local fixture'})
        if url.path=='/api/user/profile':return self.send(200,profile())
        if url.path=='/api/ai-features/calls':
            q=parse_qs(url.query);return self.send(200,calls(int(q.get('page',['1'])[0]),q.get('search',[''])[0]))
        if url.path.startswith('/api/calls/fixture-call-') and url.path.endswith('/recording'):return self.send(200,audio_bytes,'audio/wav')
        return self.send(404,{'error':'Unknown fixture path'})
    def do_POST(self):
        if self.path!='/__control':return self.send(404,{})
        data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
        with lock:
            for key in ['failSave','expired','userId']:
                if key in data:state[key]=data[key]
        self.send(200,{'fixtureOnly':True})
    def do_PATCH(self):
        if self.path!='/api/user/profile':return self.send(404,{})
        data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
        with lock:state['requests'].append({'method':'PATCH','path':self.path,'origin':self.headers.get('Origin'),'fields':sorted(data)})
        if state['expired'] or 'next-auth.session-token=local-ui-fixture' not in self.headers.get('Cookie',''):return self.send(401,{'error':'Unauthorized local fixture'})
        if state['failSave']:return self.send(400,{'error':'Local fixture save failed. Your draft is unchanged.'})
        if len(str(data.get('name','')).strip())<2:return self.send(400,{'error':'Name must be at least 2 characters long'})
        with lock:
            state['name']=data['name'].strip();state['email']=data['email'].strip().lower();state['phone']=data['phone'].strip() or None
        self.send(200,{'success':True,'user':profile()['user']})
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=3421);args=parser.parse_args()
    print(f'Local synthetic native workspace fixture on 127.0.0.1:{args.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
