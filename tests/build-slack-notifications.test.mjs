import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildNotification,notifyBuild} from '../scripts/notify-build-slack.mjs';
const env={SLACK_APP_UPDATES_ENABLED:'true',SLACK_MOBILE_BUILD_BOT_TOKEN:'test-only-not-a-token',SLACK_MOBILE_APP_IOS_CHANNEL_ID:'C0BJD401P1S',SLACK_MOBILE_APP_ANDROID_CHANNEL_ID:'C0BJBA3J36D',GITHUB_REPOSITORY:'Codehosted/trashed-app-driver',GITHUB_RUN_ID:'1234',GITHUB_SHA:'a'.repeat(40),GITHUB_REF_NAME:'feat/test',MOBILE_PLATFORM:'ios',MOBILE_BUILD_STATUS:'success',MOBILE_VERSION:'1.0.3',MOBILE_BUILD_NUMBER:'202609160900'};
test('routes only to exact platform channels and does not claim store publication',()=>{
 const ios=buildNotification(env),android=buildNotification({...env,MOBILE_PLATFORM:'android'});
 assert.equal(ios.channel,'C0BJD401P1S');assert.equal(android.channel,'C0BJBA3J36D');assert.match(ios.text,/TestFlight processing verified/);assert.match(android.text,/QA APK/);assert.match(ios.text,/not a production-store release/);assert.notEqual(ios.client_msg_id,android.client_msg_id);assert.equal(ios.client_msg_id,buildNotification(env).client_msg_id);
});
test('escapes untrusted branch text and rejects missing/wrong provenance',()=>{
 assert.doesNotMatch(buildNotification({...env,GITHUB_REF_NAME:'<@U123> & fake'}).text,/<@U123>/);
 for(const update of [{MOBILE_PLATFORM:'web'},{MOBILE_BUILD_STATUS:'ready'},{GITHUB_REPOSITORY:'attacker/repo'},{GITHUB_RUN_ID:'not-id'},{GITHUB_SHA:'bad'},{SLACK_MOBILE_APP_IOS_CHANNEL_ID:''}])assert.throws(()=>buildNotification({...env,...update}));
 for(const status of ['failure','cancelled','skipped'])assert.doesNotMatch(buildNotification({...env,MOBILE_BUILD_STATUS:status}).text,/processing verified|available in the CI artifacts/);
});
test('approval gate prevents every network call',async()=>{
 let called=false;const result=await notifyBuild({...env,SLACK_APP_UPDATES_ENABLED:'false'},async()=>{called=true;throw new Error('unexpected');});assert.equal(result.status,'disabled');assert.equal(called,false);
});
function mock(responses){const calls=[];return{calls,fetch:async(url,options)=>{calls.push({method:url.split('/').at(-1),body:JSON.parse(options.body)});const value=responses.shift();if(!value)throw new Error('Unexpected call');return new Response(JSON.stringify(value),{status:200});}};}
test('posts then reads back the exact target without duplicate sends',async()=>{
 const text=buildNotification(env).text;const api=mock([{ok:true,messages:[]},{ok:true,channel:env.SLACK_MOBILE_APP_IOS_CHANNEL_ID,ts:'100.1'},{ok:true,messages:[{ts:'100.1',text}]}]);const result=await notifyBuild(env,api.fetch);assert.equal(result.status,'posted');assert.deepEqual(api.calls.map(c=>c.method),['conversations.history','chat.postMessage','conversations.history']);assert.equal(api.calls[2].body.oldest,'100.1');assert.equal(api.calls[2].body.latest,'100.1');
});
test('updates a previous matching run/platform message on rerun',async()=>{
 const body=buildNotification(env);const api=mock([{ok:true,messages:[{ts:'100.1',metadata:body.metadata}]},{ok:true,channel:body.channel,ts:'100.1'},{ok:true,messages:[{ts:'100.1',text:body.text}]}]);assert.equal((await notifyBuild(env,api.fetch)).status,'updated');assert.equal(api.calls[1].method,'chat.update');
});
test('readback mismatch or API rejection never reports successful delivery',async()=>{
 const api=mock([{ok:true,messages:[]},{ok:true,channel:env.SLACK_MOBILE_APP_IOS_CHANNEL_ID,ts:'100.1'},{ok:true,messages:[{ts:'100.1',text:'different'}]}]);await assert.rejects(notifyBuild(env,api.fetch),/read-back/);
 await assert.rejects(notifyBuild(env,mock([{ok:false,error:'missing_scope'}]).fetch),/missing_scope/);
});
