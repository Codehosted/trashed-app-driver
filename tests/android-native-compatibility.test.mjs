import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {test} from 'node:test';
const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');
test('measured renderer preserves API 23 without newer collection or TextView APIs',()=>{
 const source=read('android/app/src/main/java/com/trashed/driver/NativeChatView.java');
 assert.doesNotMatch(source,/\.removeIf\(|\.stream\(|textView\.setLineHeight\(/);
 assert.match(source,/Iterator<EditText> fields = bindings\.keySet\(\)\.iterator\(\)/);
 assert.match(source,/TextViewCompat\.setLineHeight\(textView,/);
 assert.match(read('android/variables.gradle'),/minSdkVersion\s*=\s*23\b/);
});
test('appearance gradient reads keep Android API23 compatibility',()=>{
 const source=read('android/app/src/main/java/com/trashed/driver/NativeSystemAppearance.java');
 const method=source.slice(source.indexOf('static int gradientColor'),source.indexOf('static boolean accent'));
 assert.match(method,/SDK_INT>=24/);assert.match(method,/gradient\.getColor\(\)/);
 assert.match(method,/finally \{gradient\.setBounds\(bounds\);pixel\.recycle\(\);\}/);
 assert.equal((source.match(/gradient\.getColor\(\)/g)||[]).length,1);
 assert.doesNotMatch(source,/\bg\.getColor\(\)|\(\(GradientDrawable\)d\)\.getColor\(\)/);
});
test('instrumentation-only activity exceptions are narrow and absent from release',()=>{
 const debug=read('android/app/src/debug/AndroidManifest.xml');
 assert.doesNotMatch(debug,/<application[^>]*tools:ignore/);
 const hosts=[...debug.matchAll(/<activity\b[^>]*>/g)].map(([row])=>row);
 assert.equal(hosts.length,5);
 for(const host of hosts){
  const name=host.match(/android:name="com\.trashed\.driver\.([^"]+)"/)[1];
  assert.match(host,/android:exported="false"/);
  assert.match(host,/tools:ignore="MissingClass"/);
  assert.ok(existsSync(new URL(`android/app/src/androidTest/java/com/trashed/driver/${name}.java`,root)));
  assert.ok(!existsSync(new URL(`android/app/src/main/java/com/trashed/driver/${name}.java`,root)));
  assert.ok(!read('android/app/src/main/AndroidManifest.xml').includes(name));
 }
});
test('Android CI uses explicit supported SDK packages and independent platform switches',()=>{
 const android=read('.github/workflows/android-checkpoint.yml'),ios=read('.github/workflows/testflight.yml');
 assert.match(android,/packages: 'platform-tools platforms;android-36 build-tools;36\.0\.0'/);
 assert.match(android,/:app:lintDebug/);
 assert.match(ios,/build_ios:[\s\S]*?type: boolean/);
 assert.match(ios,/github\.event_name != 'workflow_dispatch' \|\| inputs\.build_ios/);
});
