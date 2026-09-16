#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const safe=(value,max=200)=>String(value??'').slice(0,max).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
export function buildNotification(env){
 const platform=env.MOBILE_PLATFORM;
 if(!['ios','android'].includes(platform))throw new Error('MOBILE_PLATFORM must be ios or android');
 const status=env.MOBILE_BUILD_STATUS;
 if(!['success','failure','cancelled','skipped'].includes(status))throw new Error('Invalid build status');
 const repo=env.GITHUB_REPOSITORY,run=env.GITHUB_RUN_ID,sha=env.GITHUB_SHA;
 if(repo!=='Codehosted/trashed-app-driver'||!/^\d+$/.test(run??'')||!/^[a-f0-9]{40}$/i.test(sha??''))throw new Error('Invalid repository/run/commit provenance');
 const channel=env[platform==='ios'?'SLACK_MOBILE_APP_IOS_CHANNEL_ID':'SLACK_MOBILE_APP_ANDROID_CHANNEL_ID'];
 if(!/^C[A-Z0-9]{8,}$/.test(channel??''))throw new Error('Platform Slack channel is missing or invalid');
 const version=safe(env.MOBILE_VERSION||'unknown'),build=safe(env.MOBILE_BUILD_NUMBER||'not assigned'),branch=safe(env.GITHUB_REF_NAME);
 const runUrl=`https://github.com/${repo}/actions/runs/${run}`;
 const label=platform==='ios'?'iOS':'Android';
 const detail=status==='success'?(platform==='ios'?'TestFlight processing verified; ready for internal testing.':'Android QA APK and checksums are available in the CI artifacts.'):'No new build availability is asserted. Check the CI log for details.';
 const text=`*Trashed ${label} build ${status}*\nVersion ${version} · Build ${build}\nBranch: ${branch} · Commit: ${sha.slice(0,12)}\n${detail}\nCI: <${runUrl}|Build and artifacts>\nTest build only; not a production-store release.`;
 const raw=createHash('sha256').update(`${repo}:${platform}:${run}`).digest('hex');
 const clientMsgId=`${raw.slice(0,8)}-${raw.slice(8,12)}-4${raw.slice(13,16)}-a${raw.slice(17,20)}-${raw.slice(20,32)}`;
 return {channel,text,client_msg_id:clientMsgId,unfurl_links:false,unfurl_media:false,metadata:{event_type:'trashed_mobile_build',event_payload:{repository:repo,platform,run_id:run}}};
}

export async function notifyBuild(env=process.env,fetchImpl=fetch){
 if(env.SLACK_APP_UPDATES_ENABLED!=='true')return {status:'disabled',reason:'Enable only after exact channel/template approval'};
 const notification=buildNotification(env),token=env.SLACK_MOBILE_BUILD_BOT_TOKEN;
 if(!token)throw new Error('Slack build bot credential is missing');
 async function api(method,payload){
  const response=await fetchImpl(`https://slack.com/api/${method}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Slack ${method} HTTP ${response.status}`);
  const result=await response.json();if(!result.ok)throw new Error(`Slack ${method}: ${result.error||'unknown error'}`);return result;
 }
 // Reruns update the same run/platform message instead of posting duplicates.
 let cursor='',existing;
 for(let page=0;page<5;page++){
  const history=await api('conversations.history',{channel:notification.channel,limit:100,include_all_metadata:true,...(cursor?{cursor}:{})});
  existing=history.messages?.find(m=>m.metadata?.event_type===notification.metadata.event_type&&m.metadata.event_payload?.run_id===env.GITHUB_RUN_ID&&m.metadata.event_payload?.platform===env.MOBILE_PLATFORM);
  if(existing)break;
  cursor=history.response_metadata?.next_cursor||'';if(!cursor)break;
 }
 if(cursor&&!existing)throw new Error('Slack history window incomplete; refusing possible duplicate');
 const result=existing?await api('chat.update',{...notification,ts:existing.ts}):await api('chat.postMessage',notification);
 if(result.channel!==notification.channel||!result.ts)throw new Error('Slack returned unexpected target');
 const verify=await api('conversations.history',{channel:notification.channel,oldest:result.ts,latest:result.ts,inclusive:true,limit:1,include_all_metadata:true});
 const actual=verify.messages?.find(m=>m.ts===result.ts);
 if(!actual||actual.text!==notification.text)throw new Error('Slack message read-back did not match');
 return {status:existing?'updated':'posted',channel:result.channel,ts:result.ts,run:env.GITHUB_RUN_ID,platform:env.MOBILE_PLATFORM};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 notifyBuild().then(result=>{if(process.env.SLACK_RECEIPT_PATH)writeFileSync(process.env.SLACK_RECEIPT_PATH,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
