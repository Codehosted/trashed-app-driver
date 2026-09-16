#!/usr/bin/env python3
"""Drive the real iOS fixture build through XcodeBuildMCP semantic refs.
Requires an installed Debug Simulator app and scripts/native-workspace-fixture.py.
Never targets production or types credentials; fixture identity is test-only.
"""
import argparse,json,os,re,subprocess,time,urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--cli',required=True);p.add_argument('--simulator',required=True);p.add_argument('--output',required=True);p.add_argument('--mode',choices=['profile','calls','errors','lifecycle'],required=True);args=p.parse_args()
out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
origin='http://127.0.0.1:3421';report={'mode':args.mode,'fixtureOnly':True,'checks':{},'screenshots':[]}
def cmd(action,**data):
    data['simulatorId']=args.simulator
    r=subprocess.run(['node',args.cli,'ui-automation',action,'--json',json.dumps(data),'--output','json'],text=True,capture_output=True,timeout=45)
    try:value=json.loads(r.stdout)
    except ValueError:raise RuntimeError(r.stderr or r.stdout)
    if r.returncode or value.get('didError'):raise RuntimeError(str(value)[:1600])
    return value

def snapshot():
    s=cmd('snapshot-ui')['data']['capture'];(out/'latest-ui.json').write_text(json.dumps(s,indent=2));return s

def wait(text):
    for _ in range(12):
        s=snapshot()
        if text in json.dumps(s):return s
        time.sleep(.25)
    raise RuntimeError('Expected UI missing: '+text)
def ref(identifier=None,label=None,action='tap',prefix=None):
    s=snapshot();rows=[r.split('|') for r in s.get('targets',[])]
    hits=[r[0] for r in rows if r[1]==action and ((identifier is not None and r[-1]==identifier) or (label is not None and r[3]==label) or (prefix is not None and r[3].startswith(prefix)))]
    if len(hits)!=1:raise RuntimeError(f'Nonunique target {identifier or label or prefix}: {rows}')
    return hits[0]
def tap(**kwargs):cmd('tap',elementRef=ref(**kwargs))
def fill(identifier,text):cmd('type-text',elementRef=ref(identifier=identifier,action='typeText'),text=text,replaceExisting=True)
def scroll(direction='up',distance=.7):
    s=snapshot();r=next(r.split('|')[0] for r in s['scroll'] if 'workspace-call-history' in r);cmd('swipe',withinElementRef=r,direction=direction,distance=distance)
def shot(name):
    path=out/(name+'.png');subprocess.run(['xcrun','simctl','io',args.simulator,'screenshot',str(path)],capture_output=True,check=True);report['screenshots'].append(str(path))
def state():return json.load(urllib.request.urlopen(origin+'/__state',timeout=5))
def control(**data):return urllib.request.urlopen(urllib.request.Request(origin+'/__control',json.dumps(data).encode(),{'Content-Type':'application/json'}),timeout=5).read()
def launch(path):
    subprocess.run(['xcrun','simctl','terminate',args.simulator,'com.trashed.driver'],capture_output=True)
    env={**os.environ,'SIMCTL_CHILD_TRASHED_WORKSPACE_FIXTURE_ORIGIN':origin,'SIMCTL_CHILD_TRASHED_WORKSPACE_FIXTURE_PATH':path}
    subprocess.run(['xcrun','simctl','launch',args.simulator,'com.trashed.driver'],env=env,capture_output=True,check=True)
    wait('workspace-edit-profile' if path=='/vendor/profile' else 'Avery Taylor')
try:
    assert json.load(urllib.request.urlopen(origin+'/__health'))['fixtureOnly']
    control(failSave=False,expired=False,userId=12)
    if args.mode=='profile':
        launch('/vendor/profile');shot('profile')
        before=state()['name'];count=len([r for r in state()['requests'] if r['method']=='PATCH'])
        tap(identifier='workspace-edit-profile');fill('workspace-edit-name','Draft to discard');tap(label='Cancel');wait('Discard unsaved changes?')
        assert state()['name']==before;tap(label='Discard changes');assert len([r for r in state()['requests'] if r['method']=='PATCH'])==count;report['checks']['discardWithoutWrite']=True
        tap(identifier='workspace-edit-profile');fill('workspace-edit-name','Morgan Verified Fixture');tap(identifier='workspace-save-profile');wait('Morgan Verified Fixture')
        assert state()['name']=='Morgan Verified Fixture';s=snapshot();assert 'workspace-edit-name' not in json.dumps(s);report['checks']['nativePatchAndReadback']=True;shot('profile-saved')
    elif args.mode=='lifecycle':
        launch('/vendor/profile');before=len(state()['requests'])
        cmd('button',buttonType='home')
        s=snapshot();assert 'workspace-edit-profile' not in json.dumps(s), 'Home did not background fixture'
        subprocess.run(['xcrun','simctl','launch',args.simulator,'com.trashed.driver'],capture_output=True,check=True)
        wait('workspace-edit-profile')
        assert len(state()['requests'])>before, 'Foreground did not revalidate HTTP profile'
        report['checks']['foregroundRevalidatesProfile']=True
        cmd('button',buttonType='home')
        s=snapshot();assert 'workspace-edit-profile' not in json.dumps(s)
        control(userId=13)
        subprocess.run(['xcrun','simctl','launch',args.simulator,'com.trashed.driver'],capture_output=True,check=True)
        s=wait('Your workspace changed.')
        assert 'workspace-edit-profile' not in json.dumps(s)
        report['checks']['changedAccountClearsProfileOnResume']=True;shot('lifecycle-account-changed')
    elif args.mode=='calls':
        launch('/calls/history');shot('calls-page-one')
        tap(identifier='workspace-call-fixture-call-1');wait('Synthetic local transcript');tap(label='Play recording');wait('Pause recording')
        tap(prefix='Avery Taylor (Fixture),');s=wait('Pause recording')
        assert 'Synthetic local transcript' not in json.dumps(s);assert re.search(r'0:[0-9]{2} elapsed, 0:20 total',json.dumps(s));report['checks']['nativePlaybackSurvivesCollapse']=True;shot('audio-collapsed');(out/'playback-ui.json').write_text(json.dumps(s,indent=2))
        tap(label='Pause recording');wait('Play recording');report['checks']['pause']=True
        tap(label='Stop and close recording')
        for _ in range(4):
            if any('workspace-load-more' in r for r in snapshot().get('targets',[])):break
            scroll()
        tap(identifier='workspace-load-more');scroll(distance=.5);wait('Jamie Brooks');assert 'workspace-load-more' not in json.dumps(snapshot());report['checks']['paginationToFinalPage']=True;shot('calls-page-two')
        s=snapshot();r=next(r.split('|')[0] for r in s['targets'] if '|typeText|' in r and '|Search calls|' in r)
        cmd('type-text',elementRef=r,text='Avery',replaceExisting=True);s=wait('Avery Taylor');assert not any('Jordan Parker' in r for r in s['targets']);assert any('search=Avery' in r['path'] for r in state()['requests']);report['checks']['nativeSearch']=True
    else:
        launch('/vendor/profile');control(failSave=True)
        tap(identifier='workspace-edit-profile');fill('workspace-edit-name','Retry Fixture');tap(identifier='workspace-save-profile');wait('Local fixture save failed.')
        assert state()['name']!='Retry Fixture';assert 'Retry Fixture' in json.dumps(snapshot());report['checks']['saveFailureKeepsDraft']=True;shot('profile-error')
        control(failSave=False);tap(identifier='workspace-save-profile');wait('Retry Fixture');assert state()['name']=='Retry Fixture';report['checks']['retryReadback']=True
        control(expired=True)
        # Relaunch same authenticated fixture cookie; real HTTP401 must hide profile data.
        subprocess.run(['xcrun','simctl','terminate',args.simulator,'com.trashed.driver'],capture_output=True)
        env={**os.environ,'SIMCTL_CHILD_TRASHED_WORKSPACE_FIXTURE_ORIGIN':origin,'SIMCTL_CHILD_TRASHED_WORKSPACE_FIXTURE_PATH':'/vendor/profile'}
        subprocess.run(['xcrun','simctl','launch',args.simulator,'com.trashed.driver'],env=env,capture_output=True,check=True)
        s=wait('session has expired');assert 'Retry Fixture' not in json.dumps(s);report['checks']['unauthorizedHidesProfile']=True;shot('profile-expired')
    report['status']='passed'
except Exception as e:
    report['status']='failed';report['error']=str(e);raise
finally:
    report['http']=state()['requests'];control(failSave=False,expired=False,userId=12)
    (out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
