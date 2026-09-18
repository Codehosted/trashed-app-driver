#!/usr/bin/env python3
"""Run host avatar policy tests with cached JDK/JUnit; no Gradle or network."""
from pathlib import Path
import os
import subprocess
import tempfile
root = Path(__file__).resolve().parents[1]
cache = Path.home()/'.gradle/caches/modules-2/files-2.1'
def jar(group, artifact, version):
    found = list((cache/group/artifact/version).glob('*/'+artifact+'-'+version+'.jar'))
    if len(found) != 1:
        raise SystemExit('Missing cached test dependency: '+artifact)
    return str(found[0])
cp = os.pathsep.join([jar('junit','junit','4.13.2'), jar('org.hamcrest','hamcrest-core','1.3')])
java = Path(os.environ.get('JAVA_HOME','/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'))/'bin'
with tempfile.TemporaryDirectory(prefix='trashed-dock-avatar-tests-') as output:
    sources = [root/'android/app/src/main/java/com/trashed/driver/NativeDockAvatarPolicy.java',
               root/'android/app/src/test/java/com/trashed/driver/NativeDockAvatarPolicyTest.java']
    subprocess.run([str(java/'javac'),'-encoding','UTF-8','-cp',cp,'-d',output,*map(str,sources)],check=True,timeout=45)
    subprocess.run([str(java/'java'),'-cp',output+os.pathsep+cp,'org.junit.runner.JUnitCore','com.trashed.driver.NativeDockAvatarPolicyTest'],check=True,timeout=30)
