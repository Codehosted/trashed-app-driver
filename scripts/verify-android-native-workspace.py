#!/usr/bin/env python3
"""Install existing Debug artifacts and verify native workspace on an emulator only.
No build, reset, account login, external endpoints, or production writes.
"""
import argparse,json,subprocess,xml.etree.ElementTree as ET
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--adb',default='/opt/homebrew/share/android-commandlinetools/platform-tools/adb');p.add_argument('--emulator',required=True);p.add_argument('--output',required=True);args=p.parse_args()
if not args.emulator.startswith('emulator-'):raise SystemExit('This fixture verifier only runs on an explicitly named Android emulator')
root=Path.cwd();out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
def adb(*values,timeout=180):
    r=subprocess.run([args.adb,'-s',args.emulator,*values],capture_output=True,text=True,timeout=timeout)
    if r.returncode:raise RuntimeError(r.stderr or r.stdout)
    return r.stdout
report={'fixtureOnly':True,'emulator':args.emulator,'status':'failed'}
try:
    if adb('get-state').strip()!='device':raise RuntimeError('Emulator is not ready')
    apk=root/'android/app/build/outputs/apk/debug/app-debug.apk'
    test_apk=root/'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
    if not apk.is_file() or not test_apk.is_file():raise RuntimeError('Build :app:assembleDebug :app:assembleDebugAndroidTest first')
    for path in [apk,test_apk]:
        result=adb('install','-r',str(path))
        if 'Success' not in result:raise RuntimeError(result)
    result=adb('shell','am','instrument','-w','-e','class','com.trashed.driver.NativeWorkspaceRegressionTest','com.trashed.driver.test/androidx.test.runner.AndroidJUnitRunner',timeout=240)
    (out/'instrumentation.log').write_text(result)
    # adb am instrument can exit0 even when tests fail; assert the actual runner result.
    if 'OK (5 tests)' not in result or 'FAILURES' in result:raise RuntimeError(result)
    adb('pull','/sdcard/Android/data/com.trashed.driver/files/native-workspace-qa',str(out))
    names=['profile-light','profile-saved-light','profile-dark','calls-dark','audio-expanded-dark','audio-collapsed-dark','profile-save-error','profile-expired','search-results-light']
    images=[out/'native-workspace-qa'/(name+'.png') for name in names]
    if not all(path.is_file() for path in images):raise RuntimeError('Missing expected screenshots')
    suites=[ET.parse(path).getroot() for path in (root/'android/app/build/test-results/testDebugUnitTest').glob('TEST-*.xml')]
    counts={key:sum(int(suite.get(key,0)) for suite in suites) for key in ['tests','failures','errors','skipped']}
    lint=root/'android/app/build/reports/lint-results-debug.xml'
    errors=sum(issue.get('severity')=='Error' for issue in ET.parse(lint).findall('issue')) if lint.exists() else None
    report.update(status='passed',runtimeTests=5,screenshots=[str(path) for path in images],javaUnit=counts,lintErrors=errors)
finally:
    (out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
