import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url).pathname;
const cases=[
 {text:'caller: Hello\nassistant: Hi, how can I help?\ncaller: A dumpster please.', roles:['caller','assistant','caller'], texts:['Hello','Hi, how can I help?','A dumpster please.'], times:['','','']},
 {text:'assistant: First line\n  continuation: keep https://example.test/a:b\n\nsecond paragraph\nassistant: Separate turn',roles:['assistant','assistant'],texts:['First line\n  continuation: keep https://example.test/a:b\n\nsecond paragraph','Separate turn'],times:['','']},
 {text:'Unlabeled preface\nCaller: Need help\nAgent: Ready',roles:['unknown','caller','assistant'],texts:['Unlabeled preface','Need help','Ready'],times:['','','']},
 {text:'[00:05] customer: Hello 👋\r\n01:12 Assistant: Hi!\r\noperator: Human operator',roles:['caller','assistant','operator'],texts:['Hello 👋','Hi!','Human operator'],times:['00:05','01:12','']},
 {text:'user: The word assistant: is part of this sentence\nsystem: Unrecognized event\nassistant:',roles:['caller','assistant'],texts:['The word assistant: is part of this sentence\nsystem: Unrecognized event',''],times:['','']},
 {text:'  \n\r\n',roles:[],texts:[],times:[]},
 {text:'A plain unstructured transcript with <b>literal</b> text.',roles:['unknown'],texts:['A plain unstructured transcript with <b>literal</b> text.'],times:['']},
];
test('Swift transcript parser preserves speaker turns, multiline text and timestamps', {skip:process.platform!=='darwin',timeout:90000},()=>{
 const dir=mkdtempSync(join(tmpdir(),'transcript-swift-'));
 try{
  const inputs=cases.map(x=>'String(data: Data(base64Encoded: "'+Buffer.from(x.text).toString('base64')+'")!, encoding: .utf8)!').join(',\n');
  writeFileSync(join(dir,'main.swift'),`import Foundation\nlet inputs=[${inputs}]\nlet rows=inputs.map { text in NativeCallTranscript.parse(text).map { ["role":$0.role.rawValue,"text":$0.text,"timestamp":$0.timestamp ?? ""] } }\nprint(String(data:try! JSONSerialization.data(withJSONObject:rows),encoding:.utf8)!)`);
  const build=spawnSync('xcrun',['swiftc',root+'ios/App/App/NativeCallTranscript.swift',join(dir,'main.swift'),'-o',join(dir,'run')],{encoding:'utf8',timeout:60000});assert.equal(build.status,0,build.stderr);
  const result=spawnSync(join(dir,'run'),[],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);const rows=JSON.parse(result.stdout);
  for(let i=0;i<cases.length;i++){assert.deepEqual(rows[i].map(x=>x.role),cases[i].roles);assert.deepEqual(rows[i].map(x=>x.text),cases[i].texts);assert.deepEqual(rows[i].map(x=>x.timestamp),cases[i].times);}
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('Java transcript parser matches the same conversation fixtures', {timeout:90000},()=>{
 const java=process.env.JAVA_HOME||'/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
 const dir=mkdtempSync(join(tmpdir(),'transcript-java-'));
 try{
  const rows=cases.map(c=>`check("${Buffer.from(c.text).toString('base64')}",new String[]{${c.roles.map(x=>JSON.stringify(x)).join(',')}},new String[]{${c.texts.map(x=>'decode("'+Buffer.from(x).toString('base64')+'")').join(',')}},new String[]{${c.times.map(x=>JSON.stringify(x)).join(',')}});`).join('\n');
  writeFileSync(join(dir,'TranscriptHarness.java'),`package com.trashed.driver; import java.util.*;import java.nio.charset.StandardCharsets; public class TranscriptHarness { static String decode(String s){return new String(Base64.getDecoder().decode(s),StandardCharsets.UTF_8);} static void check(String input,String[] roles,String[] texts,String[] times){List<NativeCallTranscript.Turn> turns=NativeCallTranscript.parse(decode(input));if(turns.size()!=roles.length)throw new AssertionError("turn count");for(int i=0;i<turns.size();i++){var t=turns.get(i);if(!t.role.equals(roles[i])||!t.text.equals(texts[i])||!t.timestamp.equals(times[i]))throw new AssertionError("turn "+i);}} public static void main(String[] args){${rows}\nSystem.out.println("PASS 7 shared transcript fixtures");}}`);
  const build=spawnSync(java+'/bin/javac',['-d',dir,root+'android/app/src/main/java/com/trashed/driver/NativeCallTranscript.java',join(dir,'TranscriptHarness.java')],{encoding:'utf8',timeout:45000});assert.equal(build.status,0,build.stderr);
  const result=spawnSync(java+'/bin/java',['-cp',dir,'com.trashed.driver.TranscriptHarness'],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS 7/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
