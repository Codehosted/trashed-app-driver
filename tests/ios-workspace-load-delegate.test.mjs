import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
test('actual WebKit delegate proxy forwards original lifecycle and policy selectors', {skip:process.platform!=='darwin',timeout:90000},()=>{
 const root=new URL('../',import.meta.url).pathname;
 const source=readFileSync(root+'ios/App/App/MainViewController.swift','utf8');
 const proxy=source.slice(source.indexOf('private final class WorkspaceLoadDelegate'),source.indexOf('private let driverSessionCookieNames'));
 const dir=mkdtempSync(join(tmpdir(),'native-load-delegate-'));
 try {
 writeFileSync(join(dir,'Harness.swift'),`import Foundation
import AppKit
import WebKit
class MainViewController: NSObject {
 var events:[String]=[]
 func workspaceLoadFinished(_ navigation:WKNavigation?) { events.append("finish") }
 func workspaceLoadFailed(_ navigation:WKNavigation?) { events.append("fail") }
}
${proxy}
final class Original: NSObject, WKNavigationDelegate {
 var events:[String]=[]
 func webView(_ webView:WKWebView,didStartProvisionalNavigation navigation:WKNavigation!) { events.append("start") }
 func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!) { events.append("finish") }
 func webView(_ webView:WKWebView,didFail navigation:WKNavigation!,withError error:Error) { events.append("fail") }
 func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error) { events.append("provisional") }
 func webViewWebContentProcessDidTerminate(_ webView:WKWebView) { events.append("terminated") }
 func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void) { events.append("policy");decisionHandler(.cancel) }
}
@main struct Run { @MainActor static func main() {
 _=NSApplication.shared
 let host=MainViewController(), original=Original(), web=WKWebView()
 let proxy=WorkspaceLoadDelegate(forward:original,host:host)
 let delegate:WKNavigationDelegate=proxy
 delegate.webView?(web,didStartProvisionalNavigation:nil)
 proxy.webView(web,didFinish:nil)
 proxy.webView(web,didFail:nil,withError:URLError(.notConnectedToInternet))
 proxy.webView(web,didFailProvisionalNavigation:nil,withError:URLError(.cancelled))
 proxy.webViewWebContentProcessDidTerminate(web)
 precondition(original.events == ["start","finish","fail","provisional","terminated"])
 precondition(host.events == ["finish","fail","fail","fail"])
 let selector=NSSelectorFromString("webView:decidePolicyForNavigationAction:decisionHandler:")
 precondition(proxy.responds(to:selector))
 precondition(proxy.forwardingTarget(for:selector) as? Original === original)
 print("PASS original WebKit lifecycle, URL policy forwarding and native outcome callbacks")
} }
`);
 let r=spawnSync('xcrun',['swiftc','-parse-as-library',join(dir,'Harness.swift'),'-o',join(dir,'run')],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);
 r=spawnSync(join(dir,'run'),[],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/PASS original WebKit/);console.log(r.stdout.trim());
 }finally{rmSync(dir,{recursive:true,force:true});}
});
