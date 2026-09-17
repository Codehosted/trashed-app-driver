import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
const root=new URL('../',import.meta.url).pathname,read=n=>readFileSync(root+'ios/App/App/'+n,'utf8');
test('real WebKit cookie store and native HTTP distinguish rolling token from account change', {skip:process.platform!=='darwin',timeout:120000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dashboard-webkit-'));let server;
 try{
 const requests=[];
 server=createServer((req,res)=>{
  const token=req.headers.cookie??'';requests.push({path:req.url,renewed:token.includes('renewed')});
  const authorized=token.includes('local-ui-fixture');
  const id=token.includes('other-account')?99:12;
  res.writeHead(authorized?200:401,{'Content-Type':'application/json','Cache-Control':'private, no-store'});
  const value={version:1,generatedAt:'2026-09-17T00:00:00Z',scope:{userId:id,vendorId:29},businessName:'Synthetic renewal fixture',currency:'USD',revenue:{today:0,thisWeek:0,thisMonth:12,thisQuarter:12,thisYear:34,monthlyGrowthPercent:null},monthlyRevenue:[{month:'Sep',revenue:12}],rentals:{total:0,active:0,pending:0,completed:0},inventory:{total:0,available:0,rented:0,maintenance:0},customers:{total:0},inventoryByType:[]};
  res.end(JSON.stringify(authorized?value:{error:'Unauthorized fixture'}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 const model=read('NativeWorkspaceModel.swift');const impl=model.slice(model.indexOf('@available',model.indexOf('final class WorkspaceAudio')));
 const code=`import Foundation\nimport WebKit\nimport SwiftUI\nimport AppKit\n@MainActor final class WorkspaceAudio {func stop(){}}\n${impl}
 @main struct Run {
 @MainActor static func cookie(_ store:WKHTTPCookieStore,_ value:String)async{let c=HTTPCookie(properties:[.name:"next-auth.session-token",.value:value,.domain:"127.0.0.1",.path:"/"])!;await withCheckedContinuation{done in store.setCookie(c){done.resume()}}}
 @MainActor static func wait(_ condition:()->Bool)async throws{for _ in 0..<150{if condition(){return};try await Task.sleep(nanoseconds:100_000_000)};fatalError("WebKit observer timeout")}
 @MainActor static func main()async throws{
 _ = NSApplication.shared
 setbuf(stdout,nil)
 let origin=URL(string:"http://127.0.0.1:${port}")!;let data=WKWebsiteDataStore.nonPersistent();let store=data.httpCookieStore
 let config=WKWebViewConfiguration();config.websiteDataStore=data;let web=WKWebView(frame:.zero,configuration:config)
 _ = web
 await cookie(store,"local-ui-fixture-initial")
 let model=WorkspaceModel(api:WorkspaceAPI(origin:origin,cookieStore:store));await model.loadDashboard();precondition(model.dashboard?.scope.userId==12)
 let initial=model.api
 await cookie(store,"local-ui-fixture-renewed")
 // CLI WebKit does not reliably dispatch observer notifications without NSApplication.run.
 // Deliver the production observer callback deterministically; real cookie store/HTTP remain unchanged.
 (model.api as! WorkspaceAPI).cookiesDidChange(in:store)
 try await wait{model.api !== initial && model.dashboard != nil && !model.loading}
 precondition(!model.invalidated && model.dashboard?.scope.userId==12,"same-user renewal locked dashboard")
 let second=model.api
 await cookie(store,"local-ui-fixture-renewed-again")
 // A refresh also catches a changed cookie if the observer notification is delayed.
 await model.loadDashboard()
 try await wait{model.api !== second && model.dashboard != nil && !model.loading}
 precondition(model.dashboard?.scope.userId==12)
 await cookie(store,"local-ui-fixture-other-account")
 (model.api as! WorkspaceAPI).cookiesDidChange(in:store)
 try await wait{model.invalidated};precondition(model.dashboard==nil,"different-account snapshot leaked")
 model.close();print("PASS real WebKit rolling cookies and native HTTP")
 }
 }`;
 writeFileSync(join(dir,'Harness.swift'),code);
 const build=spawnSync('xcrun',['swiftc','-parse-as-library',root+'ios/App/App/NativeWorkspacePolicy.swift',root+'ios/App/App/NativeWorkspaceAPI.swift',join(dir,'Harness.swift'),'-o',join(dir,'run')],{encoding:'utf8',timeout:60000});assert.equal(build.status,0,build.stderr);
 const result=await new Promise((resolve,reject)=>{const p=spawn(join(dir,'run'));let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);const timer=setTimeout(()=>{p.kill();reject(Error('real WebKit timeout: '+stderr.slice(-1800)))},45000);p.on('exit',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})});
 assert.equal(result.code,0,result.stdout+result.stderr+JSON.stringify(requests));assert.match(result.stdout,/PASS real WebKit/);assert.equal(requests.length,4);assert(requests.every(x=>x.path==='/api/mobile/dashboard'));console.log(JSON.stringify({realWebKitCookieStore:true,deterministicObserverCallback:true,httpReads:requests.length,success:true}));
 }finally{if(server)await new Promise(r=>server.close(r));rmSync(dir,{force:true,recursive:true})}
});
