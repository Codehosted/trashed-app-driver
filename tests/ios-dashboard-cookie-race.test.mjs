import assert from 'node:assert/strict';
import {test} from 'node:test';
import {writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
test('stale workspace responses cannot replace or revoke newer WebKit credentials', {skip: process.platform !== 'darwin', timeout: 120000}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'workspace-cookie-race-'));
  const requests = [];
  let mode = '', pending, ready;
  const dashboard = id => ({version: 1, generatedAt: '2026-09-17T00:00:00Z', scope: {userId: id, vendorId: 29}, businessName: 'Cookie race fixture', currency: 'USD', revenue: {today: 0, thisWeek: 0, thisMonth: 12, thisQuarter: 12, thisYear: 34, monthlyGrowthPercent: null}, monthlyRevenue: [], rentals: {total: 0, active: 0, pending: 0, completed: 0}, inventory: {total: 0, available: 0, rented: 0, maintenance: 0}, customers: {total: 0}, inventoryByType: []});
  const user = {id: 12, name: 'Fixture', email: 'before@example.invalid', phone: null, roles: ['vendor'], vendor: {id: 29, businessName: 'Fixture'}};
  const server = createServer((req, res) => {
    const path = req.url;
    if (path.startsWith('/control/arm/')) { mode = path.split('/').at(-1); res.end(); return; }
    if (path === '/control/ready') { if (pending) res.end(); else ready = res; return; }
    if (path === '/control/release') { const finish = pending; pending = undefined; finish(); res.end(); return; }
    requests.push({path, method: req.method, token: req.headers.cookie ?? ''});
    if (path === '/api/user/profile') {
      res.writeHead(200, {'Content-Type': 'application/json', ...(req.method === 'PATCH' ? {'Set-Cookie': 'next-auth.session-token=; Path=/; Max-Age=0'} : {})});
      res.end(JSON.stringify(req.method === 'PATCH' ? {success: true, reauthenticationRequired: true, user: {...user, email: 'after@example.invalid'}} : {user, capabilities: {calls: true}}));
      return;
    }
    const id = (req.headers.cookie ?? '').includes('account-B') ? 99 : 12;
    const body = JSON.stringify(dashboard(id));
    if (!mode) { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(body); return; }
    const scenario = mode; mode = '';
    const status = scenario === 'unauthorized' ? 401 : scenario === 'forbidden' ? 403 : 200;
    const headers = {'Content-Type': 'application/json', 'Set-Cookie': scenario === 'revocation' ? 'next-auth.session-token=; Path=/; Max-Age=0' : 'next-auth.session-token=account-A-stale; Path=/; HttpOnly'};
    // Body mode starts a real streaming HTTP response before the credential switch.
    if (scenario === 'body') { res.writeHead(status, {'Content-Type': 'application/json'}); res.write(body.slice(0, 1)); }
    pending = () => { if (scenario !== 'body') res.writeHead(status, headers); res.end(scenario === 'body' ? body.slice(1) : body); };
    ready?.end(); ready = undefined;
  });
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const code = `import Foundation
import WebKit
import AppKit
@main struct Run {
 @MainActor static func cookies(_ store:WKHTTPCookieStore)async->[HTTPCookie]{await withCheckedContinuation{done in store.getAllCookies{done.resume(returning:$0)}}}
 @MainActor static func put(_ store:WKHTTPCookieStore,_ value:String)async{let c=HTTPCookie(properties:[.name:"next-auth.session-token",.value:value,.domain:"127.0.0.1",.path:"/"])!;await withCheckedContinuation{done in store.setCookie(c){done.resume()}}}
 @MainActor static func main()async throws{
 _ = NSApplication.shared;setbuf(stdout,nil)
 let origin=URL(string:"http://127.0.0.1:${port}")!
 func control(_ path:String)async throws{_ = try await URLSession.shared.data(from:URL(string:"/control/"+path,relativeTo:origin)!)}
 var failures:[String]=[]
 for scenario in ["rotation","revocation","unauthorized","forbidden","body","cancel","task-cancel","close"] {
  let data=WKWebsiteDataStore.nonPersistent();let store=data.httpCookieStore
  let config=WKWebViewConfiguration();config.websiteDataStore=data;let web=WKWebView(frame:.zero,configuration:config)
  await put(store,"account-A")
  let api=WorkspaceAPI(origin:origin,cookieStore:store)
  // Delayed observer delivery is deliberate: real WebKit storage + real native HTTP,
  // without relying on CLI NSApplication observer scheduling to expose the race.
  store.remove(api)
  try await control("arm/"+scenario)
  let task=Task{try await api.dashboard()}
  try await control("ready")
  await put(store,"account-B")
  if scenario == "cancel" {api.cancelPending()}
  if scenario == "task-cancel" {task.cancel()}
  if scenario == "close" {api.close()}
  try await control("release")
  do{_ = try await task.value;failures.append(scenario+": stale dashboard accepted")}
  catch WorkspaceError.scopeChanged {if !["rotation","revocation","body"].contains(scenario){failures.append(scenario+": unexpected scope rejection")}}
  catch WorkspaceError.expired {if scenario != "unauthorized"{failures.append(scenario+": unexpected expired rejection")}}
  catch WorkspaceError.forbidden {if scenario != "forbidden"{failures.append(scenario+": unexpected forbidden rejection")}}
  catch {if !["cancel","task-cancel","close"].contains(scenario){failures.append(scenario+": unexpected failure: \\(error)")}}
  let value=await cookies(store).first{$0.name == "next-auth.session-token"}?.value
  if value != "account-B" {failures.append(scenario+": newer B cookie overwritten/revoked: \\(value ?? "missing")")}
  if scenario == "rotation" {
   if let replacement=api.renewedSession(){
    do{let value=try await replacement.dashboard();if value.scope.userId != 99{failures.append("renewal silently resumed stale A")}}catch{failures.append("B recheck failed: \\(error)")};replacement.close()
   }else{failures.append("replacement cookie not offered for bounded server recheck")}
   if api.renewedSession() != nil{failures.append("renewal was not bounded")}
  }
  api.close();withExtendedLifetime(web){}
 }
 // Email changes are server-revoked (credentialVersion) and explicitly request login.
 // Ignoring Set-Cookie must preserve the actionable emailChanged result, not a scope error.
 let data=WKWebsiteDataStore.nonPersistent();let store=data.httpCookieStore
 await put(store,"account-A")
 let api=WorkspaceAPI(origin:origin,cookieStore:store);store.remove(api)
 let profile=try await api.profile()
 do{_ = try await api.save(.init(name:"Fixture",email:"after@example.invalid",phone:""),scope:profile.scope(origin:origin));failures.append("email save did not require login")}
 catch WorkspaceError.emailChanged {}catch{failures.append("email reauth lost: \\(error)")}
 if await cookies(store).first(where:{$0.name == "next-auth.session-token"})?.value != "account-A"{failures.append("profile transport mutated credentials")}
 api.close()
 if !failures.isEmpty{print(failures.joined(separator:"\\n"));exit(1)}
 print("PASS real WebKit stale response rotation/revocation/401/403/body/cancel/task-cancel/close and email reauthentication")
 }
}`;
    writeFileSync(join(dir, 'Harness.swift'), code);
    const build = spawnSync('xcrun', ['swiftc', '-parse-as-library', root + 'ios/App/App/NativeWorkspacePolicy.swift', root + 'ios/App/App/NativeWorkspaceAPI.swift', join(dir, 'Harness.swift'), '-o', join(dir, 'run')], {encoding: 'utf8', timeout: 60000});
    assert.equal(build.status, 0, build.stderr);
    const result = await new Promise((resolve, reject) => {
      const p = spawn(join(dir, 'run')); let stdout = '', stderr = '';
      p.stdout.on('data', x => stdout += x); p.stderr.on('data', x => stderr += x);
      const timer = setTimeout(() => { p.kill(); reject(Error('WebKit timeout: ' + stdout + stderr.slice(-2000))); }, 45000);
      p.on('error', reject); p.on('exit', code => { clearTimeout(timer); resolve({code, stdout, stderr}); });
    });
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS real WebKit/);
    assert.equal(requests.filter(r => r.path === '/api/user/profile' && r.method === 'PATCH').length, 1);
    assert.equal(requests.filter(r => r.path === '/api/mobile/dashboard' && r.token.includes('account-A-stale')).length, 0);
    console.log(result.stdout.trim());
  } finally {
    server.closeAllConnections(); await new Promise(r => server.close(r)); rmSync(dir, {recursive: true, force: true});
  }
});
