#!/usr/bin/env python3
"""Focused cached-JDK tests: no Gradle, app build, install, or production calls."""
from pathlib import Path
import os
import subprocess
import tempfile
import zipfile
import sys

root = Path(__file__).resolve().parents[1]
cache = Path.home() / '.gradle/caches/modules-2/files-2.1'
def jar(group, name, version):
    matches = sorted((cache / group / name / version).glob('*/' + name + '-' + version + '.jar'))
    if len(matches) != 1:
        raise SystemExit(f'Missing cached {group}:{name}:{version}; no automatic download')
    return str(matches[0])
cp = os.pathsep.join([jar('junit', 'junit', '4.13.2'), jar('org.hamcrest', 'hamcrest-core', '1.3'), jar('org.json', 'json', '20240303')])
java = Path(os.environ.get('JAVA_HOME', '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home')) / 'bin'
source = root / 'android/app/src/main/java/com/trashed/driver'
tests = root / 'android/app/src/test/java/com/trashed/driver'
# Source wiring guards complement JVM transport tests; they are not device tests.
activity = (source / 'MainActivity.java').read_text()
dispatch = activity[activity.index('void setNativeNavigation('):activity.index('private void revalidateNativeWorkspaceNavigation(')]
assert dispatch.index('!nativeNavigation.accepts(selection)') < dispatch.index('if (openDirectWorkspace(selection)) return;') < dispatch.index('listener.select(selection);')
workspace = (source / 'NativeWorkspaceView.java').read_text()
assert 'new NativeRentalsMapView(tokens' in workspace
assert 'run(NativeWorkspaceApi::rentalsMap' in workspace
assert '"rentals".equals(destination) ? "vendor-rentals"' in activity
assert 'rentalsView.dispose()' in workspace and 'rentalsView.clear()' in workspace
names = ['NativeRentalsMapTest', 'NativeWorkspacePolicyTest', 'NativeWorkspaceRouteTest', 'NativeWorkspaceApiTest', 'NativeDashboardTest']
files = [source / (name + '.java') for name in ['NativeWorkspaceHistory', 'NativeWorkspacePolicy', 'NativeWorkspaceRoute', 'NativeWorkspaceApi', 'NativeDashboard', 'NativeMapViewport']]
if (source / 'NativeRentalsMap.java').exists():
    files.append(source / 'NativeRentalsMap.java')
files += [tests / (name + '.java') for name in names]
with tempfile.TemporaryDirectory(prefix='trashed-rentals-java-') as output:
    subprocess.run([str(java / 'javac'), '-cp', cp, '-d', output, *map(str, files)], check=True, timeout=60)
    result = subprocess.run([str(java / 'java'), '-cp', output + os.pathsep + cp, 'org.junit.runner.JUnitCore', *['com.trashed.driver.' + name for name in names]], timeout=90)
    if result.returncode:
        raise SystemExit(result.returncode)
    if '--compile-native' in sys.argv:
        # Existing generated resource symbols/Capacitor jars only; no Gradle or downloads.
        sibling = Path(os.environ.get('ANDROID_CACHED_BUILD', str(root.parent / 'trashed-app-mobile')))
        sdk = Path(os.environ.get('ANDROID_JAR', '/opt/homebrew/share/android-commandlinetools/platforms/android-36/android.jar'))
        resources = sibling / 'android/app/build/intermediates/compile_and_runtime_not_namespaced_r_class_jar/debug/processDebugResources/R.jar'
        if not sdk.exists() or not resources.exists():
            raise SystemExit('Missing Android SDK or cached generated R.jar; set ANDROID_JAR/ANDROID_CACHED_BUILD')
        libraries = [sdk, resources]
        libraries += sorted(cache.glob('*/*/*/*/*.jar'))
        libraries += sorted(sibling.glob('artifacts/dependency-builds/*/intermediates/compile_library_classes_jar/debug/*/classes.jar'))
        for index, aar in enumerate(sorted(cache.glob('*/*/*/*/*.aar'))):
            with zipfile.ZipFile(aar) as archive:
                for member in archive.namelist():
                    if member == 'classes.jar' or (member.startswith('libs/') and member.endswith('.jar')):
                        target = Path(output) / (str(index) + '-' + member.replace('/', '-'))
                        target.write_bytes(archive.read(member)); libraries.append(target)
        native_files = sorted(source.glob('*.java'))
        native_output = Path(output) / 'native'; native_output.mkdir()
        subprocess.run([str(java / 'javac'), '-proc:none', '-cp', os.pathsep.join(map(str, libraries)), '-d', str(native_output), *map(str, native_files)], check=True, timeout=90)
        print(f'Compiled all {len(native_files)} app Java sources against Android SDK and cached libraries (no APK).')
