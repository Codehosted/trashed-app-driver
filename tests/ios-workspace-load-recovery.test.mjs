import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../ios/App/App/MainViewController.swift',import.meta.url),'utf8');
test('workspace handoff keeps a native loading/error surface until matching WebKit completion',()=>{
 assert.match(source,/final class WorkspaceLoadDelegate: NSObject, WKNavigationDelegate/);
 assert.match(source,/forwardingTarget\(for aSelector: Selector!\)/);
 assert.match(source,/forward\.webView\?\(webView, didFinish: navigation\)/);
 assert.match(source,/forward\.webView\?\(webView, didFailProvisionalNavigation: navigation, withError: error\)/);
 assert.match(source,/navigation === workspaceLoadNavigation/);
 assert.match(source,/workspaceLoadGeneration == generation/);
 assert.match(source,/workspace-load-recovery/);
 assert.match(source,/Return to dashboard/);
 assert.match(source,/Retry/);
 assert.match(source,/startWorkspaceWebLoad\(url\)/);
 const handoff=source.slice(source.indexOf('    private func openWorkspaceWeb('),source.indexOf('    @available(iOS 16.0, *)\n    func prepareNativePushLogout'));
 assert.ok(handoff.indexOf('showWorkspaceLoadCover')<handoff.indexOf('dismissNativeWorkspace {'));
 assert.match(handoff,/workspaceNavigationGeneration == generation/);
});
