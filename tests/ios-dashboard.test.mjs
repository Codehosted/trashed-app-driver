import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import{join}from'node:path';import{spawnSync}from'node:child_process';
const root=new URL('../',import.meta.url).pathname,read=n=>readFileSync(root+'ios/App/App/'+n,'utf8');
test('dashboard uses one authorized API snapshot and rejects malformed/cross-account/stale state', {skip:process.platform!=='darwin',timeout:90000},()=>{
 const dir=mkdtempSync(join(tmpdir(),'dashboard-swift-'));
 try{
 const api=read('NativeWorkspaceAPI.swift'),model=read('NativeWorkspaceModel.swift');
 const protocol=api.slice(api.indexOf('@available'),api.indexOf('// Refuse ALL redirects.'));
 const impl=model.slice(model.indexOf('@available',model.indexOf('final class WorkspaceAudio')));
 // Stop at the method boundary, not the calls endpoint: Rentals now sits between them.
 const dashboardStart=api.indexOf('    func dashboard() async throws -> WorkspaceDashboard {');
 assert.ok(dashboardStart>=0);
 const dashboardEnd=api.indexOf('\n    }',dashboardStart);
 assert.ok(dashboardEnd>dashboardStart);
 const endpoint=api.slice(dashboardStart,dashboardEnd);
 assert.equal((endpoint.match(/try await json/g)||[]).length,1);assert.doesNotMatch(endpoint,/validateScope|await profile/);
 const harness=`import Foundation\nimport SwiftUI\n${protocol}\n@MainActor final class WorkspaceAudio {func stop(){}}\n${impl}
 @MainActor final class API: WorkspaceServing {
 let origin=URL(string:"https://fixture.invalid")!;var onSessionChange:(()->Void)?;var calls=0;var reads=0;var response:WorkspaceDashboard?;var failure:Error?;var pending:CheckedContinuation<WorkspaceDashboard,Error>?;var delay=false
 func profile()async throws->WorkspaceProfile{reads+=1;throw WorkspaceError.invalidResponse}
 func dashboard()async throws->WorkspaceDashboard{calls+=1;if delay{return try await withCheckedThrowingContinuation{pending=$0}};if let failure=failure{throw failure};return response!}
 func calls(query:WorkspaceCallsQuery,page:Int,scope:String)async throws->WorkspaceCallsPage{throw WorkspaceError.invalidResponse}
 func save(_ edit:WorkspaceProfileEdit,scope:String)async throws->WorkspaceProfile{throw WorkspaceError.invalidResponse}
 func recording(_ call:WorkspaceCall,scope:String)async throws->(Data,String){throw WorkspaceError.invalidResponse}
 func cancelPending(){};func close(){}
 }
 func check(_ b:@autoclosure()->Bool,_ label:String){if !b(){fatalError(label)}}
 func value(_ user:Int=1)->WorkspaceDashboard{WorkspaceDashboard(version:1,generatedAt:"2026-09-16T12:00:00Z",scope:.init(userId:user,vendorId:2),businessName:"Fixture",currency:"USD",revenue:.init(today:0,thisWeek:0,thisMonth:12,thisQuarter:12,thisYear:34,monthlyGrowthPercent:nil),monthlyRevenue:[.init(month:"Jan",revenue:0)],rentals:.init(total:0,active:0,pending:0,completed:0),inventory:.init(total:0,available:0,rented:0,maintenance:0),customers:.init(total:0),inventoryByType:[])}
 @main struct Run {@MainActor static func main()async{
 let api=API();api.response=value();let model=WorkspaceModel(api:api);await model.loadDashboard();check(api.calls==1&&api.reads==0&&model.dashboard != nil,"one request initial load")
 api.failure=WorkspaceError.server("offline");await model.loadDashboard();check(model.dashboard != nil&&model.error != nil,"error preserves snapshot")
 api.failure=nil;api.response=value(99);await model.loadDashboard();check(model.invalidated&&model.dashboard==nil,"scope change clears")
 let other=API();other.response=value();let safe=WorkspaceModel(api:other);await safe.loadDashboard();safe.suspend();await safe.resume();check(other.calls==2&&other.reads == 0 && !safe.suspended,"resume authorizes once")
 let late=API();late.delay=true;let closed=WorkspaceModel(api:late);let task=Task{await closed.loadDashboard()};while late.pending==nil{await Task.yield()};closed.close();late.pending!.resume(returning:value());await task.value;check(closed.dashboard==nil,"late result after close ignored")
 let denied=API();denied.failure=WorkspaceError.forbidden;let no=WorkspaceModel(api:denied);await no.loadDashboard();check(no.invalidated&&no.dashboard==nil,"forbidden never empty success")
 let good=value();check((try? good.validated()) != nil,"valid DTO")
 print("PASS dashboard transport, scope, error, resume and cancellation")
 }}
 `;
 writeFileSync(join(dir,'Harness.swift'),harness);
 let r=spawnSync('xcrun',['swiftc','-parse-as-library',root+'ios/App/App/NativeWorkspacePolicy.swift',join(dir,'Harness.swift'),'-o',join(dir,'run')],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);
 r=spawnSync(join(dir,'run'),[],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/PASS dashboard/);
 }finally{rmSync(dir,{force:true,recursive:true})}
});
