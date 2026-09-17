import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url).pathname,read=n=>readFileSync(root+'ios/App/App/'+n,'utf8');
test('dashboard rechecks renewed credentials without retaining data across actual account changes', {skip:process.platform!=='darwin',timeout:90000},()=>{
 const dir=mkdtempSync(join(tmpdir(),'dashboard-renewal-'));
 try{
 const api=read('NativeWorkspaceAPI.swift'),model=read('NativeWorkspaceModel.swift');
 const protocol=api.slice(api.indexOf('@available'),api.indexOf('// Refuse ALL redirects.'));
 const impl=model.slice(model.indexOf('@available',model.indexOf('final class WorkspaceAudio')));
 const harness=`import Foundation\nimport SwiftUI\n${protocol}\n@MainActor final class WorkspaceAudio {func stop(){}}\n${impl}
 @MainActor final class API: WorkspaceServing {
 let origin=URL(string:"https://fixture.invalid")!;var onSessionChange:(()->Void)?;var successor:API?;var response:WorkspaceDashboard?;var failure:Error?;var pending:CheckedContinuation<WorkspaceDashboard,Error>?;var delay=false;var closed=false;var reads=0;var profileReads=0;var saves=0;var callReads=0;var actor=9
 func profile()async throws->WorkspaceProfile{profileReads+=1;return actorProfile(actor)}
 func dashboard()async throws->WorkspaceDashboard{reads+=1;if delay{return try await withCheckedThrowingContinuation{pending=$0}};if let failure=failure{throw failure};return response!}
 func calls(query:WorkspaceCallsQuery,page:Int,scope:String)async throws->WorkspaceCallsPage{callReads+=1;return .init(calls:[],totalCalls:0,totalPages:0,currentPage:1)}
 func save(_ edit:WorkspaceProfileEdit,scope:String)async throws->WorkspaceProfile{saves+=1;return actorProfile(actor)}
 func recording(_ call:WorkspaceCall,scope:String)async throws->(Data,String){throw WorkspaceError.invalidResponse}
 func renewedSession() -> (any WorkspaceServing)? { successor }
 func cancelPending(){};func close(){closed=true;onSessionChange=nil}
 }
 func actorProfile(_ id:Int)->WorkspaceProfile{.init(user:.init(id:id,name:"Fixture",email:"fixture@example.test",phone:nil,image:nil,roles:["vendor"],vendor:.init(id:2,businessName:"Fixture"),emailVerified:true),capabilities:.init(calls:true))}
 func check(_ b:@autoclosure()->Bool,_ label:String){if !b(){fatalError(label)}}
 func value(_ user:Int=1,_ vendor:Int=2)->WorkspaceDashboard{WorkspaceDashboard(version:1,generatedAt:"2026-09-16T12:00:00Z",scope:.init(userId:user,vendorId:vendor),businessName:"Fixture",currency:"USD",revenue:.init(today:0,thisWeek:0,thisMonth:12,thisQuarter:12,thisYear:34,monthlyGrowthPercent:nil),monthlyRevenue:[.init(month:"Jan",revenue:0)],rentals:.init(total:0,active:0,pending:0,completed:0),inventory:.init(total:0,available:0,rented:0,maintenance:0),customers:.init(total:0),inventoryByType:[])}
 @MainActor func wait(_ ready:()->Bool)async{for _ in 0..<10000{if ready(){return};await Task.yield()};fatalError("timeout")}
 @main struct Run {@MainActor static func main()async{
 let first=API();first.response=value();let next=API();next.delay=true;first.successor=next
 let model=WorkspaceModel(api:first);await model.loadDashboard();check(model.dashboard != nil,"seed");first.onSessionChange?()
 check(model.dashboard==nil,"hide private snapshot immediately during revalidation")
 await wait{next.pending != nil}
 check(model.api === first,"replacement credentials quarantined during dashboard validation")
 await model.loadProfile();await model.loadCalls(.init());let saved=await model.save(.init(name:"Fixture",email:"fixture@example.test",phone:""))
 check(!saved && model.profile==nil && next.profileReads==0 && next.callReads==0 && next.saves==0,"no sensitive use before validation")
 next.pending!.resume(returning:value());await wait{!model.loading}
 check(!model.invalidated && model.dashboard?.scope.userId==1,"same account token renewal recovers");check(first.closed,"old transport retired");check(next.reads==1,"bounded recheck")
 for changed in [value(9),value(1,8)] {
  let a=API();a.response=value();let b=API();b.response=changed;a.successor=b;let m=WorkspaceModel(api:a);await m.loadDashboard();a.onSessionChange?();await wait{m.invalidated};check(m.dashboard==nil,"cross-account/vendor data never exposed")
 }
 let a=API();a.response=value();let b=API();b.failure=WorkspaceError.forbidden;a.successor=b;let denied=WorkspaceModel(api:a);await denied.loadDashboard();a.onSessionChange?();await wait{denied.invalidated};check(denied.dashboard==nil,"revoked permission clears")
 let old=API();old.response=value();let delayed=API();delayed.delay=true;old.successor=delayed;let closed=WorkspaceModel(api:old);await closed.loadDashboard();old.onSessionChange?();await wait{delayed.pending != nil};closed.close();delayed.pending!.resume(returning:value());await Task.yield();check(closed.dashboard==nil,"closed renewal cannot resurrect")
 // Background/resume keeps the candidate private and discards the old pending response.
 let pausedOld=API();pausedOld.response=value();let pausedCandidate=API();pausedCandidate.delay=true;pausedOld.successor=pausedCandidate
 let paused=WorkspaceModel(api:pausedOld);await paused.loadDashboard();pausedOld.onSessionChange?();await wait{pausedCandidate.pending != nil}
 let obsolete=pausedCandidate.pending!;paused.suspend();check(paused.api === pausedOld && paused.dashboard==nil,"suspended candidate stays quarantined")
 pausedCandidate.delay=false;pausedCandidate.response=value();await paused.resume();obsolete.resume(returning:value(9));await Task.yield()
 check(!paused.invalidated && !paused.suspended && paused.dashboard?.scope.userId==1 && paused.api === pausedCandidate,"resume validates candidate, ignores obsolete foreign result")
 let unstableOld=API();unstableOld.response=value();let unstableCandidate=API();unstableCandidate.delay=true;unstableOld.successor=unstableCandidate
 let unstable=WorkspaceModel(api:unstableOld);await unstable.loadDashboard();unstableOld.onSessionChange?();await wait{unstableCandidate.pending != nil};unstableCandidate.onSessionChange?();unstableCandidate.pending!.resume(returning:value());await Task.yield()
 check(unstable.invalidated && unstable.dashboard==nil && unstableCandidate.closed,"second credential change during validation fails closed")
 // A transient failure must not leave unverified candidate credentials usable.
 let failed=API();failed.response=value();let candidate=API();candidate.failure=WorkspaceError.server("Synthetic temporary failure");failed.successor=candidate
 let transient=WorkspaceModel(api:failed);await transient.loadDashboard();failed.onSessionChange?();await wait{!transient.loading}
 await transient.loadProfile();await transient.loadCalls(.init());let mutation=await transient.save(.init(name:"Fixture",email:"fixture@example.test",phone:""))
 check(candidate.closed && transient.api === failed && candidate.profileReads==0 && !mutation,"failed candidate remains quarantined")
 // Even after a successful renewal, another API returning a foreign actor is rejected.
 next.actor=9;await model.loadProfile();check(model.invalidated && model.profile==nil,"dashboard actor binds later profile reads")
 let logout=API();logout.response=value();let expired=WorkspaceModel(api:logout);await expired.loadDashboard();logout.onSessionChange?();check(expired.invalidated && expired.dashboard==nil,"logout/no candidate remains fail closed")
 print("PASS renewed token, same user, foreign user/vendor, revocation, closed response, logout")
 }}
 `;
 writeFileSync(join(dir,'Harness.swift'),harness);
 let r=spawnSync('xcrun',['swiftc','-parse-as-library',root+'ios/App/App/NativeWorkspacePolicy.swift',join(dir,'Harness.swift'),'-o',join(dir,'run')],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);
 r=spawnSync(join(dir,'run'),[],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/PASS renewed token/);console.log(r.stdout.trim());
 }finally{rmSync(dir,{recursive:true,force:true})}
});
