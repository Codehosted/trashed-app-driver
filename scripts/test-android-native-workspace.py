#!/usr/bin/env python3
"""Compile actual Android workspace policy/transport with cached JUnit/JSON.
No Android framework mocks or live production traffic; fixture HTTP is loopback.
Run from the mobile repository. Gradle runs these same JVM tests in CI.
"""
from pathlib import Path
import os, subprocess, tempfile
root = Path.cwd()
cache = Path.home()/'.gradle/caches/modules-2/files-2.1'
def jar(group,name,version):
    matches = sorted((cache/group/name/version).glob('*/'+name+'-'+version+'.jar'))
    if len(matches)!=1: raise SystemExit(f'Expected cached {group}:{name}:{version}; use Gradle to resolve dependencies first')
    return str(matches[0])
cp=os.pathsep.join([jar('junit','junit','4.13.2'),jar('org.hamcrest','hamcrest-core','1.3'),jar('org.json','json','20240303')])
java_home=Path(os.environ.get('JAVA_HOME','/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'))
source=root/'android/app/src/main/java/com/trashed/driver'
tests=root/'android/app/src/test/java/com/trashed/driver'
names=['NativeWorkspacePolicyTest']
if (tests/'NativeWorkspaceApiTest.java').exists(): names.append('NativeWorkspaceApiTest')
files=[source/'NativeWorkspaceHistory.java',source/'NativeWorkspacePolicy.java']
if len(names)>1: files.append(source/'NativeWorkspaceApi.java')
files += [tests/(name+'.java') for name in names]
with tempfile.TemporaryDirectory(prefix='trashed-workspace-java-') as output:
    subprocess.run([str(java_home/'bin/javac'),'-cp',cp,'-d',output,*map(str,files)],check=True,timeout=60)
    result=subprocess.run([str(java_home/'bin/java'),'-cp',output+os.pathsep+cp,'org.junit.runner.JUnitCore',*['com.trashed.driver.'+n for n in names]],timeout=90)
    raise SystemExit(result.returncode)
