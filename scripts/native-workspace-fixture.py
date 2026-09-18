#!/usr/bin/env python3
"""Loopback-only, synthetic HTTP fixtures for native account/calls UI tests.
No database/provider credentials or production data. Start with --port 3421.
"""
import argparse, base64, hashlib, io, json, math, struct, threading, wave
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

state={'name':'Morgan Ellis (Fixture)','email':'morgan@example.test','phone':'+15555550123','userId':12,'failSave':False,'expired':False,'dashboardError':0,'dashboardZero':False,'pushError':0,'receiptMatched':True,'requests':[]}
state.update({'bridgeCommand':0,'bridgeResults':[], 'rentalsError':0, 'rentalsEmpty':False, 'rentalsPermission':True, 'rentalsWrongScope':False})
state['rentalsLargeCount'] = 0
lock=threading.Lock()
def profile():
    return {'user':{'id':state['userId'],'name':state['name'],'email':state['email'],'phone':state['phone'],'image':None,'emailVerified':True,'roles':['vendor'],'vendor':{'id':29,'businessName':'Local fixture workspace'},'vendorPermissions':{'dashboard':True,'callCenter':True,'aiAssistant':True,'profile':True,'settings':True,'rentals':state['rentalsPermission']}},'capabilities':{'calls':True}}
def rentals_map():
    """Synthetic coordinates near Detroit; no real customers or rentals."""
    rows = [
        ('Riverfront cleanup', 'delivered', 42.3295, -83.0444, 'Riverfront, Detroit, MI', '20'),
        ('Midtown renovation', 'confirmed', 42.3503, -83.0603, 'Midtown, Detroit, MI', '30'),
        ('Corktown project', 'pending', 42.3318, -83.0805, 'Corktown, Detroit, MI', '10'),
        ('Eastern Market cleanup', 'pickup_scheduled', 42.3485, -83.0406, 'Eastern Market, Detroit, MI', '20'),
        ('New Center project', 'completed', 42.3692, -83.0755, 'New Center, Detroit, MI', '40'),
    ]
    orders = [] if state['rentalsEmpty'] else [
        {'id':f'00000000-0000-4000-8000-{i:012d}', 'label':f'FIX-{i:03d} · {size} yd',
         'status':status, 'source':'marketplace', 'address':address,
         'customerName':name+' (Fixture)', 'confirmationCode':f'FIX-{i:03d}',
         'totalPrice':'450.00', 'dumpsterSize':size, 'dumpsterDescription':f'{size} Yard Dumpster',
         'href':f'/vendor/rentals/00000000-0000-4000-8000-{i:012d}',
         'deliveryDate':'2026-09-17T12:00:00Z', 'pickupDate':'2026-09-24T12:00:00Z',
         'lat':lat, 'lng':lng}
        for i,(name,status,lat,lng,address,size) in enumerate(rows,1)
    ]
    if orders and state['rentalsLargeCount']:
        templates = orders
        orders = []
        for index in range(state['rentalsLargeCount']):
            order = dict(templates[index % len(templates)])
            order['id'] = f'00000000-0000-4000-8000-{index+1:012d}'
            order['href'] = '/vendor/rentals/' + order['id']
            order['dumpsterDescription'] = 'Synthetic large-response fixture. ' + 'x' * 1400
            orders.append(order)
    missing = 0 if state['rentalsEmpty'] else 1
    return {'version':1, 'generatedAt':'2026-09-17T12:00:00Z',
            'scope':{'userId':state['userId'], 'vendorId':30 if state['rentalsWrongScope'] else 29},
            'orders':orders, 'count':len(orders), 'totalRentalCount':len(orders)+missing, 'unmappedCount':missing}
def rentals_page(data, query):
    """Synthetic page transport fixture, not production backend verification."""
    values = parse_qs(query, keep_blank_values=True)
    if 'pageSize' not in values and 'cursor' not in values:
        return 200, data
    try:
        if len(values.get('pageSize', [])) != 1 or not values['pageSize'][0].isascii() or not values['pageSize'][0].isdigit():
            raise ValueError()
        page_size = int(values['pageSize'][0])
        if not 1 <= page_size <= 200:
            raise ValueError()
        identity = {key: value for key, value in data.items() if key != 'generatedAt'}
        digest = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        offset = 0
        if 'cursor' in values:
            if len(values['cursor']) != 1:
                raise ValueError()
            token = values['cursor'][0]
            if not token or len(token) > 256 or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_' for c in token):
                raise ValueError()
            cursor = json.loads(base64.urlsafe_b64decode(token + '=' * (-len(token) % 4)))
            if set(cursor) != {'offset', 'snapshot'} or type(cursor['offset']) != int or cursor['offset'] <= 0:
                raise ValueError()
            if cursor['snapshot'] != digest:
                return 409, {'error':'Rental map changed. Refresh and try again.'}
            offset = cursor['offset']
            if offset >= data['count']:
                raise ValueError()
        page = {**data, 'version':2, 'orders':[], 'count':0, 'mappedCount':data['count'], 'snapshot':digest, 'nextCursor':None}
        size = len(json.dumps(page).encode()) + 512
        for row in data['orders'][offset:offset+page_size]:
            length = len(json.dumps(row).encode()) + 2
            if size + length > 256 * 1024:
                if not page['orders']:
                    return 413, {'error':'Rental map record too large. Open the rental list.'}
                break
            page['orders'].append(row)
            size += length
        page['count'] = len(page['orders'])
        end = offset + page['count']
        if end < data['count']:
            token = json.dumps({'offset':end,'snapshot':digest},separators=(',', ':')).encode()
            page['nextCursor'] = base64.urlsafe_b64encode(token).decode().rstrip('=')
        assert len(json.dumps(page).encode()) <= 256 * 1024
        return 200, page
    except (ValueError, KeyError, TypeError):
        return 400, {'error':'Invalid rental map page'}

def calls(page,search):
    names=['Avery Taylor','Jordan Parker','Riley Morgan','Casey Blair','Drew Bennett','Josh Berry','Cameron Reed','Hayden Ross','Reese Ward','Alex Rivera','Emerson Hayes','Jamie Brooks']
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
        if url.path=='/__bridge-command':return self.send(200,{'id':state['bridgeCommand']})
        with lock:state['requests'].append({'method':'GET','path':self.path,'authenticated':self.headers.get('Cookie','').find('next-auth.session-token=local-ui-fixture')>=0})
        if state['expired'] or 'next-auth.session-token=local-ui-fixture' not in self.headers.get('Cookie',''):return self.send(401,{'error':'Unauthorized local fixture'})
        if url.path=='/vendor/profile' and parse_qs(url.query).get('view')==['account']:
            html='''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font:20px -apple-system;padding:24px"><h1>Synthetic account fixture</h1><button style="font:inherit;padding:16px" onclick="document.getElementById('status').textContent='Revoking';window.Capacitor.nativePromise('TrashedWorkspacePush','prepareLogout',{}).then(r=>{document.getElementById('status').textContent=r.ok?'Native revocation acknowledged':'Missing acknowledgement'}).catch(e=>{document.getElementById('status').textContent='Logout blocked: '+e.message})">Verify native logout handshake</button><p id="status">Signed in fixture</p></body></html>'''
            # Actual top-frame Capacitor bridge, driven only by the explicit loopback QA server.
            html=html.replace('</body>', '''<script>
            let seen=0;setInterval(async()=>{try{const command=await fetch('/__bridge-command').then(r=>r.json());
            if(!command.id||command.id===seen||!window.Capacitor?.nativePromise)return;seen=command.id;
            let result;try{const r=await window.Capacitor.nativePromise('TrashedWorkspacePush','prepareLogout',{});result={id:seen,ok:r.ok===true};}catch{result={id:seen,ok:false};}
            document.getElementById('status').textContent=result.ok?'Native revocation acknowledged':'Logout blocked';
            await fetch('/__bridge-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
            }catch{}},250);</script></body>''')
            return self.send(200,html.encode(),'text/html')
        if url.path == '/vendor/rentals' or url.path.startswith('/vendor/rentals/00000000-0000-4000-8000-'):
            # Explicit local web fallback for native-root navigation QA, not product UI.
            title = 'Synthetic rental list' if url.path == '/vendor/rentals' else 'Synthetic rental details'
            html = f'''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{{color-scheme:light dark}}body{{font:20px -apple-system;padding:24px}}a{{display:block;padding:16px}}</style></head><body><h1>{title}</h1><p>Local QA only. No live rental or customer data.</p><a href="/vendor/rentals?view=map">Return to rental map</a><a href="/vendor/dashboard">Return to dashboard</a></body></html>'''
            return self.send(200,html.encode(),'text/html')
        if url.path=='/api/user/profile':return self.send(200,profile())
        if url.path=='/api/vendor/rentals/map':
            if not state['rentalsPermission']:return self.send(403,{'error':'Rentals access denied'})
            if state['rentalsError']:return self.send(state['rentalsError'],{'error':'Synthetic rentals failure'})
            code, page = rentals_page(rentals_map(), url.query)
            return self.send(code,page)
        if url.path=='/api/mobile/dashboard':
            if dashboard_fixture is None:return self.send(503,{'error':'No synthetic dashboard fixture configured'})
            if state['dashboardError']:return self.send(state['dashboardError'],{'error':'Synthetic dashboard failure'})
            data=json.loads(dashboard_fixture.read_text())
            data['scope']={'userId':state['userId'],'vendorId':29}
            if state['dashboardZero']:
                for group in ['revenue','rentals','inventory','customers']:
                    data[group]={key:0 for key in data[group]}
                for month in data['monthlyRevenue']:month['revenue']=0
                data['inventoryByType']=[]
            return self.send(200,data)
        if url.path=='/api/ai-features/calls':
            q=parse_qs(url.query);return self.send(200,calls(int(q.get('page',['1'])[0]),q.get('search',[''])[0]))
        if url.path.startswith('/api/calls/fixture-call-') and url.path.endswith('/recording'):return self.send(200,audio_bytes,'audio/wav')
        return self.send(404,{'error':'Unknown fixture path'})
    def do_POST(self):
        if self.path=='/__bridge-result':
            data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
            with lock:state['bridgeResults'].append({'id':data.get('id'),'ok':data.get('ok') is True})
            return self.send(200,{'ok':True})
        if self.path in ['/api/vendor/push-token','/api/vendor/push-receipt']:
            data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
            with lock:state['requests'].append({'method':'POST','path':self.path,'fields':sorted(data),'fenced':bool(data.get('registrationId')),'receipt':data.get('receipt')})
            if state['expired']:return self.send(401,{'error':'Unauthorized local fixture'})
            if state['pushError']:return self.send(state['pushError'],{'error':'Synthetic notification error'})
            return self.send(200,{'ok':True,'fenced':bool(data.get('registrationId')),'matched':state['receiptMatched']})
        if self.path!='/__control':return self.send(404,{})
        data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
        if 'rentalsLargeCount' in data:
            if type(data['rentalsLargeCount']) != int or not 0 <= data['rentalsLargeCount'] <= 20000:
                return self.send(400,{'error':'Invalid synthetic rental count'})
            state['rentalsLargeCount'] = data['rentalsLargeCount']
        with lock:
            for key in ['failSave','expired','userId','dashboardError','dashboardZero','pushError','receiptMatched','bridgeCommand','rentalsError','rentalsEmpty','rentalsPermission','rentalsWrongScope']:
                if key in data:state[key]=data[key]
        self.send(200,{'fixtureOnly':True})
    def do_DELETE(self):
        if self.path!='/api/driver/push-token':return self.send(404,{})
        data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
        with lock:state['requests'].append({'method':'DELETE','path':self.path,'fields':sorted(data),'fenced':bool(data.get('registrationId')),'allAudiences':data.get('allAudiences')})
        if state['expired']:return self.send(401,{'error':'Unauthorized local fixture'})
        if state['pushError']:return self.send(state['pushError'],{'error':'Synthetic notification error'})
        return self.send(200,{'ok':True,'fenced':bool(data.get('registrationId'))})
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
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=3421);parser.add_argument('--dashboard-fixture',type=Path,required=False);args=parser.parse_args()
    dashboard_fixture=args.dashboard_fixture
    if dashboard_fixture is not None:assert dashboard_fixture.is_file(), 'Missing synthetic dashboard fixture'
    print(f'Local synthetic native workspace fixture on 127.0.0.1:{args.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
