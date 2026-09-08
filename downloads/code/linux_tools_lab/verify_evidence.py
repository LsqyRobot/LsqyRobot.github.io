#!/usr/bin/env python3
"""Fail closed before rendering or publishing an evidence snapshot."""
import argparse
import hashlib
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=Path('/input'))
parser.add_argument('--source', type=Path, default=Path('/lab'))
args = parser.parse_args()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise SystemExit('Evidence rejected: ' + message + '. Rerun: bash docker/linux-tools-lab/run.sh test')


state = json.loads((args.output / 'last-run.json').read_text())
require(state.get('status') == 'passed', 'the most recent run did not pass')
validation = json.loads((args.output / 'validation.json').read_text())
for name, field in [('recorded-sessions.json', 'recorded_sessions_sha256'),
                    ('validation.json', 'validation_sha256'),
                    ('full-transcript.txt', 'full_transcript_sha256')]:
    require(sha(args.output / name) == state.get(field), name + ' does not match the latest successful run')
for name, field in [('recorded-sessions.json', 'recorded_sessions_sha256'),
                    ('full-transcript.txt', 'full_transcript_sha256')]:
    require(sha(args.output / name) == validation.get(field), name + ' disagrees with validation.json')
current_sources = {p.name: sha(p) for p in args.source.iterdir() if p.suffix in ['.py', '.cpp', '.sh']}
require(current_sources == validation.get('source_sha256'), 'experiment sources changed after the recording')
expected_image = os.environ.get('LINUX_TOOLS_LAB_IMAGE_ID')
require(bool(expected_image), 'the wrapper did not supply the current image ID')
require(state.get('image_id') == validation.get('image_id') == expected_image,
        'the current image differs from the recorded image')
sessions = json.loads((args.output / 'recorded-sessions.json').read_text())
expected = set('ldd lsof ps pstack strace ipcs top free vmstat iostat sar readelf objdump nm size wget scp crontab'.split())
require(len(sessions) == 18 and {s.get('id') for s in sessions} == expected,
        'the expected 18 unique tools are not all present')
require(all(s.get('status') == 'passed' and len(s.get('steps', [])) >= 2 and s.get('checks') for s in sessions),
        'some sessions lack passing checks and recorded steps')
require(validation.get('scenarios') == [dict(id=s['id'], status=s['status'], checks=s['checks']) for s in sessions],
        'session checks differ from the validation summary')
print('Evidence verified: latest run passed; 18 sessions; current source/image and all evidence hashes match.')
