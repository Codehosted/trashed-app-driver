import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('iOS full themed server URL does not append the Android appStartPath a second time',()=>{
 const source=read('ios/App/App/MainViewController.swift');
 const descriptor=source.slice(source.indexOf('override func instanceDescriptor()'),source.indexOf('private func bundledServerURLString'));
 assert.match(descriptor,/descriptor\.serverURL = driverURLString/);
 assert.match(descriptor,/descriptor\.appStartPath = nil/,'Capacitor appStartServerURL appends this path: iOS already has the full themed /app URL');
 const config=read('capacitor.config.ts');
 assert.match(config,/url: new URL\(serverUrl\)\.origin/);
 assert.match(config,/appStartPath: '\/app\?source=trashed-app'/);
});
