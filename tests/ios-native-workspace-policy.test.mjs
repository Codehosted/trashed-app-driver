import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const source = new URL('../ios/App/App/NativeWorkspacePolicy.swift', import.meta.url).pathname;
function run(body) {
  const dir = mkdtempSync(join(tmpdir(), 'trashed-workspace-policy-'));
  try {
    writeFileSync(join(dir, 'main.swift'), `import Foundation\nfunc check(_ value: @autoclosure () -> Bool, _ label: String) { if !value() { fatalError(label) } }\n${body}`);
    const built = spawnSync('xcrun', ['swiftc', source, join(dir, 'main.swift'), '-o', join(dir, 'test')], { encoding:'utf8', timeout:60000 });
    assert.equal(built.status, 0, built.stderr);
    const result = spawnSync(join(dir,'test'), [], { encoding:'utf8', timeout:10000 });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(dir, { recursive:true, force:true }); }
}
const skip = process.platform !== 'darwin';
test('native saves require exact saved-field readback and session identity cookies exclude analytics', {skip}, () => run(`
let user = WorkspaceProfile.User(id:7,name:"Saved Name",email:"fixture@example.test",phone:nil,image:nil,roles:["vendor"],vendor:nil,emailVerified:true)
let verified = WorkspaceProfile(user:user,capabilities:WorkspaceProfile.Capabilities(calls:true))
let saved = WorkspaceSavedProfile(success:true,user:WorkspaceSavedProfile.User(id:7,name:"Saved Name",email:"fixture@example.test",phone:nil))
check(saved.matches(verified), "confirmed saved profile")
let stale = WorkspaceProfile(user:WorkspaceProfile.User(id:7,name:"Old Name",email:user.email,phone:nil,image:nil,roles:[],vendor:nil,emailVerified:nil),capabilities:verified.capabilities)
check(!saved.matches(stale), "same account with stale fields is not saved proof")
let wrong = WorkspaceSavedProfile(success:true,user:WorkspaceSavedProfile.User(id:8,name:"Saved Name",email:user.email,phone:nil))
check(!wrong.matches(verified), "different account rejected")
for name in ["next-auth.session-token", "__Secure-next-auth.session-token.0", "authjs.session-token.12", "impersonate-vendor-user-uuid", "doc-mode"] { check(WorkspacePolicy.isIdentityCookie(name), "identity cookie") }
for name in ["_ga", "theme", "next-auth.csrf-token", "next-auth.session-token.bad", "next-auth.session-token."] { check(!WorkspacePolicy.isIdentityCookie(name), "nonidentity cookie") }
`));
test('native recording policy accepts actual server UUID paths, rejects credential and path escapes', {skip}, () => run(`
let origin = URL(string:"https://trashed.app")!
let id = "a1234567-89ab-cdef-0123-456789abcdef"
let path = "/api/calls/\\(id)/recording"
check(WorkspacePolicy.recordingURL(path, callID:id, origin:origin)?.path == path, "server UUID recording URL must work")
check(WorkspacePolicy.recordingURL("https://trashed.app" + path, callID:id, origin:origin) != nil, "absolute same origin")
for raw in ["https://evil.test" + path, "http://trashed.app" + path, "https://u@trashed.app" + path, path + "?redirect=evil", path + "#bad", "/api/calls/other/recording", "/api/calls/../recording"] {
 check(WorkspacePolicy.recordingURL(raw, callID:id, origin:origin) == nil, "reject unsafe recording")
}
`));
test('native route policy preserves unconverted profile actions and canonical call query', {skip}, () => run(`
let origin = URL(string:"https://trashed.app")!
check(WorkspaceRoute.parse(URL(string:"https://trashed.app/vendor/profile")!, origin:origin) == .profile, "profile")
check(WorkspaceRoute.parse(URL(string:"https://trashed.app/vendor/profile?view=about")!, origin:origin) == .profile, "about")
for view in ["account", "inbox", "team", "access", "preferences"] {
 check(WorkspaceRoute.parse(URL(string:"https://trashed.app/vendor/profile?view=\\(view)")!, origin:origin) == nil, "keep unconverted profile action reachable")
}
check(WorkspaceRoute.parse(URL(string:"https://trashed.app/vendor/profile/preferences")!, origin:origin) == nil, "preferences route remains reachable")
let query = WorkspaceCallsQuery(search:"a&b + c", filter:"ended", sort:"duration-asc")
let url = URL(string:"https://trashed.app/calls/history?search=a%26b%20%2B%20c&filter=ended&sort=duration-asc")!
check(WorkspaceRoute.parse(url, origin:origin) == .calls(query), "canonical call query")
check(WorkspaceRoute.parse(URL(string:"https://evil.test/vendor/profile")!, origin:origin) == nil, "cross origin denied")
let parts = URLComponents(string:query.path(page:2))!
check(parts.queryItems?.first(where:{$0.name == "search"})?.value == query.search, "encoded search")
`));
test('native pagination rejects stale and out-of-order pages and deduplicates stable IDs', {skip}, () => run(`
func call(_ id:String) -> WorkspaceCall { WorkspaceCall(id:id,callId:id,customerName:"Fixture",customerPhone:"",duration:30,durationFormatted:"0:30",status:"ended",timestamp:"2026-09-16T00:00:00Z",transcript:"",hasRecording:false,recordingUrl:nil,customerSatisfaction:nil) }
var state = WorkspacePagination()
let old = state.generation
try state.apply(WorkspaceCallsPage(calls:[call("one")],totalCalls:3,totalPages:2,currentPage:1),requested:1,generation:old)
try state.apply(WorkspaceCallsPage(calls:[call("one"),call("two")],totalCalls:3,totalPages:2,currentPage:2),requested:2,generation:old)
check(state.calls.map(\\.id) == ["one","two"] && !state.hasMore, "deduplicate pages")
state.reset()
do { try state.apply(WorkspaceCallsPage(calls:[],totalCalls:0,totalPages:0,currentPage:1),requested:1,generation:old); fatalError("stale page accepted") } catch is CancellationError {}
do { try state.apply(WorkspaceCallsPage(calls:[],totalCalls:0,totalPages:0,currentPage:2),requested:2,generation:state.generation); fatalError("out of order page accepted") } catch WorkspaceError.invalidResponse {}
`));
test('native cookie policy scopes domain/path/secure/expiry without leaking to lookalike hosts', {skip}, () => run(`
func cookie(_ name:String,_ domain:String,_ path:String,_ secure:Bool = true,_ expires:Date? = nil) -> HTTPCookie {
 var p:[HTTPCookiePropertyKey:Any] = [.name:name,.value:"fixture",.domain:domain,.path:path]
 if secure { p[.secure] = "TRUE" }; if let expires = expires {p[.expires] = expires}
 return HTTPCookie(properties:p)!
}
let now = Date()
let values = [cookie("session","trashed.app","/"),cookie("chunk.0",".trashed.app","/api"),cookie("wrongpath","trashed.app","/api/user"),cookie("expired","trashed.app","/",true,now.addingTimeInterval(-10)),cookie("lookalike","trashed.app.evil","/")]
check(WorkspacePolicy.cookies(values,for:URL(string:"https://trashed.app/api/calls")!,now:now).map(\\.name) == ["chunk.0","session"], "scope cookies")
check(WorkspacePolicy.cookies(values,for:URL(string:"http://trashed.app/api/calls")!).isEmpty, "secure cookies stay on TLS")
check(WorkspacePolicy.cookies(values,for:URL(string:"https://trashed.app.evil/api/calls")!).map(\\.name) == ["lookalike"], "domain boundary")
`));
