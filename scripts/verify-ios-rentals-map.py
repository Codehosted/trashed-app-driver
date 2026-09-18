#!/usr/bin/env python3
"""Real iOS Rentals UI QA against the explicit DEBUG loopback fixture.
Requires an already-built/installed app; never builds, resets or uploads.
"""
import argparse
import json
import os
from pathlib import Path
import select
import subprocess
import time
import urllib.request
from urllib.parse import urlparse

p = argparse.ArgumentParser()
p.add_argument('--cli', required=True)
p.add_argument('--simulator', required=True)
p.add_argument('--origin', default='http://127.0.0.1:3422')
p.add_argument('--output', required=True)
p.add_argument('--phase', choices=['controls', 'states', 'navigation'], default='controls')
args = p.parse_args()
url = urlparse(args.origin)
assert url.scheme == 'http' and url.hostname == '127.0.0.1' and url.port and not url.username and not url.password
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=True)
report = {'fixtureOnly': True, 'phase': args.phase, 'checks': [], 'screenshots': []}
start = 0

def ui(action, **params):
    params['simulatorId'] = args.simulator
    proc = subprocess.Popen(['node', str(Path(args.cli).resolve()), 'ui-automation', action,
                             '--json', json.dumps(params), '--output', 'json'],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdout is not None
    buffer = b''
    deadline = time.monotonic() + 60
    try:
        while time.monotonic() < deadline:
            readable, _, _ = select.select([proc.stdout], [], [], .25)
            if not readable:
                continue
            chunk = os.read(proc.stdout.fileno(), 65536)
            if not chunk:
                break
            buffer += chunk
            try:
                result = json.loads(buffer)
            except json.JSONDecodeError:
                continue
            if result.get('didError'):
                raise RuntimeError(str(result))
            return result
        raise RuntimeError('UI driver did not return complete JSON: ' + buffer.decode()[-500:])
    finally:
        # CLI2.7 can retain a socket after its complete result. Stop only this
        # invocation, not the shared daemon or another worker's simulator.
        if proc.poll() is None:
            proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=3)
        # Daemon descendants can inherit pipe handles. Do not wait for their EOF.
        proc.stdout.close()
        if proc.stderr is not None:
            proc.stderr.close()

def snapshot():
    result = ui('snapshot-ui')['data']['capture']
    (out/'latest-ui.json').write_text(json.dumps(result, indent=2))
    return result

def wait(text):
    for _ in range(6):
        result = snapshot()
        if text in json.dumps(result):
            return result
    raise AssertionError('Expected UI missing: ' + text)

def tap(label):
    # UIKit menus animate after their opener. Wait for the actual actionable
    # child; never treat the successful opener tap as proof the menu is ready.
    for _ in range(6):
        rows = [row.split('|') for row in snapshot().get('targets', [])]
        hits = [row[0] for row in rows if row[1] == 'tap' and row[3] == label]
        if hits:
            # MapKit exposes duplicate annotation AX nodes.
            ui('tap', elementRef=hits[0])
            return
    raise AssertionError('Missing tap target: ' + label)

def photo(name):
    path = out/(name + '.png')
    subprocess.run(['xcrun', 'simctl', 'io', args.simulator, 'screenshot', str(path)], check=True, capture_output=True)
    report['screenshots'].append(str(path))

def get_state():
    return json.load(urllib.request.urlopen(args.origin + '/__state', timeout=5))

def control(**values):
    request = urllib.request.Request(args.origin + '/__control', json.dumps(values).encode(), {'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=5) as response:
        assert response.status == 200

def launch(bootstrap=False):
    subprocess.run(['xcrun', 'simctl', 'terminate', args.simulator, 'com.trashed.driver'], capture_output=True)
    env = dict(os.environ)
    env.pop('SIMCTL_CHILD_TRASHED_WORKSPACE_BOOTSTRAP_ORIGIN', None)
    env.pop('SIMCTL_CHILD_TRASHED_WORKSPACE_FIXTURE_ORIGIN', None)
    env.pop('SIMCTL_CHILD_TRASHED_WORKSPACE_FIXTURE_PATH', None)
    if bootstrap:
        env['SIMCTL_CHILD_TRASHED_WORKSPACE_BOOTSTRAP_ORIGIN'] = args.origin
    else:
        env['SIMCTL_CHILD_TRASHED_WORKSPACE_FIXTURE_ORIGIN'] = args.origin
        env['SIMCTL_CHILD_TRASHED_WORKSPACE_FIXTURE_PATH'] = '/vendor/rentals'
    subprocess.run(['xcrun', 'simctl', 'launch', args.simulator, 'com.trashed.driver'], env=env, check=True, capture_output=True)

def refresh():
    tap('Rental options')
    tap('Refresh rentals')

try:
    assert json.load(urllib.request.urlopen(args.origin + '/__health'))['fixtureOnly']
    control(rentalsEmpty=False, rentalsError=0, rentalsPermission=True, rentalsWrongScope=False, expired=False)
    start = len(get_state()['requests'])
    launch(bootstrap=args.phase == 'navigation')
    if args.phase == 'navigation':
        wait('workspace-native-menu')
        tap('Manage'); tap('Rentals'); wait('5 shown'); photo('native-dock-map')
        assert not any(row['path'] == '/vendor/rentals' for row in get_state()['requests'][start:])
        report['checks'].append('native dock opens map without Rentals HTML request')
        tap('Dashboard'); wait('workspace-dashboard')
        report['checks'].append('native Back returns to dashboard')
    elif args.phase == 'states':
        wait('5 shown')
        control(rentalsError=503); refresh(); result = wait('Could not load rentals')
        assert 'rentals-pin-' not in json.dumps(result)
        photo('error'); control(rentalsError=0); tap('Retry'); wait('5 shown')
        report['checks'].append('503 clears private pins; Retry restores data')
        control(rentalsEmpty=True); refresh(); result = wait('No rentals yet')
        assert 'rentals-pin-' not in json.dumps(result)
        photo('empty'); report['checks'].append('successful empty state')
        control(rentalsEmpty=False, rentalsWrongScope=True); refresh(); result = wait('Rentals unavailable')
        assert 'rentals-pin-' not in json.dumps(result)
        photo('foreign-scope'); report['checks'].append('foreign scope clears private data')
    else:
        wait('5 shown'); photo('overview')
        tap('Midtown renovation (Fixture), Midtown, Detroit, MI, Confirmed')
        result = snapshot()
        assert any('Midtown renovation' in row for row in result.get('text', []))
        photo('selected'); report['checks'].append('native marker selection updates summary')
        tap('Filter rentals by status'); tap('Pending'); wait('1 shown')
        photo('pending'); report['checks'].append('status filtering changes visible count')
        tap('Filter rentals by status'); tap('All statuses'); wait('5 shown')
        row = next(row for row in snapshot()['targets'] if '|typeText|' in row)
        ui('type-text', elementRef=row.split('|')[0], text='Midtown', replaceExisting=True)
        wait('1 shown'); photo('search'); report['checks'].append('native search changes visible count')
        tap('Clear rental search'); tap('Fit all visible rentals'); wait('5 shown')
        photo('fit'); report['checks'].append('clear search and fit restores all rentals')
    report['status'] = 'passed'
except Exception as error:
    report['status'] = 'failed'
    report['error'] = str(error)
    raise
finally:
    report['http'] = get_state()['requests'][start:]
    control(rentalsEmpty=False, rentalsError=0, rentalsPermission=True, rentalsWrongScope=False, expired=False)
    (out/'report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
