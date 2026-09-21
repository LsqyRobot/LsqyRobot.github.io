#!/usr/bin/env python3
"""18 isolated Linux-tool experiments. Run inside docker/linux-tools-lab only.

Native output is captured without inventing rows or performance measurements.
The GIF renderer may select/shorten rows; the full transcript stays downloadable.
No real user processes, IPC objects, crontabs, SSH services, or network endpoints
are changed. A finalizer stops only this runner's child processes and private IPC.
"""
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import socket
import subprocess
import threading
import time
import uuid

SOURCE = Path('/lab')
WORK = Path('/work/fixture')
OUT = Path('/work/out')
WORK.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
transcript = []
sessions = []
processes = []
ipc_ids = []
httpd = None
run_id = str(uuid.uuid4())


def write_state(status, **details):
    # Replace the state atomically so an interrupted write cannot look passed.
    staging = OUT / 'last-run.pending.json'
    staging.write_text(json.dumps(dict(run_id=run_id, status=status, **details), indent=2))
    staging.replace(OUT / 'last-run.json')


def run(command, expected=(0,), timeout=30, env=None):
    argv = ['bash', '-o', 'pipefail', '-c', command] if isinstance(command, str) else command
    display = command if isinstance(command, str) else shlex.join(command)
    result = subprocess.run(argv, cwd=WORK, env=env, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=timeout)
    transcript.append(f'$ {display}\n{result.stdout}[exit {result.returncode}]\n')
    if result.returncode not in expected:
        raise RuntimeError(f'{display}: exit {result.returncode}\n{result.stdout}')
    return result.stdout


def start(ident, title, notes=''):
    session = dict(id=ident, title=title, notes=notes, steps=[], checks=[], status='running')
    sessions.append(session)
    return session


def step(session, command, caption, expected=(0,), timeout=30):
    output = run(command, expected, timeout)
    session['steps'].append(dict(command=command if isinstance(command, str) else shlex.join(command),
                                 output=output, caption=caption, duration_ms=4500))
    return output


def check(session, condition, text):
    if not condition:
        session['status'] = 'failed'
        raise AssertionError(f'{session["id"]}: {text}')
    session['checks'].append(text)


def finish(session):
    session['status'] = 'passed'
    session['gif_steps'] = list(range(len(session['steps'])))
    print(f'{session["id"]}: passed ({len(session["checks"])} assertions)', flush=True)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def await_port(port, child):
    for _ in range(100):
        if child.poll() is not None:
            raise RuntimeError('SSH server exited; inspect /work/out/sshd.log')
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.1):
                return
        except OSError:
            time.sleep(0.03)
    raise RuntimeError('local SSH server did not become ready')


def main():
    global httpd
    if os.getuid() == 0:
        raise RuntimeError('The teaching experiments must run as a non-root user')
    for name in ['demo_lib.cpp', 'symbols.cpp', 'tool_demo.cpp']:
        shutil.copy2(SOURCE / name, WORK / name)
    (WORK / 'sample.txt').write_text('Linux tools: trusted local fixture.\n')
    (WORK / 'payload.txt').write_text('Reproducible Linux tools lab.\nNo external network required.\n')
    builds = [
        ['g++', '-g', '-O0', '-fPIC', '-shared', 'demo_lib.cpp', '-Wl,-soname,libdemo.so', '-o', 'libdemo.so'],
        ['g++', '-g', '-O0', '-fno-omit-frame-pointer', '-pthread', 'tool_demo.cpp', '-L.', '-ldemo', '-Wl,-rpath,$ORIGIN', '-o', 'tool_demo'],
        ['g++', '-g', '-O0', '-c', 'symbols.cpp', '-o', 'symbols.o'],
    ]
    for command in builds:
        run(command)
    versions = run(['dpkg-query', '-W', 'g++', 'gdb', 'binutils', 'libc6', 'lsof', 'procps',
                    'strace', 'util-linux', 'sysstat', 'wget', 'openssh-client', 'openssh-server',
                    'cron', 'python3', 'python3-pil', 'ripgrep', 'file', 'curl', 'iproute2',
                    'gawk', 'less', 'sed', 'grep', 'findutils', 'coreutils'])
    provenance = dict(machine=platform.machine(), platform=platform.platform(), uid=os.getuid(), gid=os.getgid(),
                      packages=versions, compile_commands=builds,
                      base_image='ubuntu:22.04@sha256:2edbbc5dc405e9612ba3584ce95480277e3eb374407b5505fe26f17df77c7dbc',
                      image_id=os.environ.get('LINUX_TOOLS_LAB_IMAGE_ID', 'unknown'),
                      source_sha256={p.name: sha(p) for p in SOURCE.iterdir() if p.suffix in ['.py', '.cpp', '.sh']},
                      binary_sha256={name: sha(WORK / name) for name in ['tool_demo', 'libdemo.so', 'symbols.o']},
                      security=dict(network='none; loopback-only temporary HTTP/SSH', root_read_only=True,
                                    non_root=True, privileged=False, host_pid=False, host_ipc=False,
                                    cap_add=['SYS_PTRACE'], seccomp='unconfined'),
                      boundaries=['pstack absent: GNU GDB batch stack alternative, not pstack execution',
                                  'crontab syntax/environment only: no cron daemon or actual scheduled execution',
                                  'CPU/memory/device metrics may describe Docker VM/host, not cgroup entitlement',
                                  'SSH scanned public key is checked against its own generated local host key; this is not remote production trust provisioning'])
    (OUT / 'provenance.json').write_text(json.dumps(provenance, indent=2))

    s = start('ldd', 'ldd: resolve trusted shared libraries')
    text = step(s, ['ldd', './tool_demo'], 'Resolve dependencies of our own trusted ELF')
    check(s, 'libdemo.so =>' in text and 'not found' not in text, 'local libdemo.so resolves and no dependency is missing')
    text = step(s, "readelf -d ./tool_demo | grep -E 'NEEDED|RUNPATH'", 'RUNPATH uses the binary directory, not the shell cwd')
    check(s, '$ORIGIN' in text and 'libdemo.so' in text, 'ELF records libdemo.so and $ORIGIN RUNPATH')
    finish(s)

    worker_log = open(OUT / 'worker.log', 'w+')
    worker = subprocess.Popen(['./tool_demo', 'worker'], cwd=WORK, stdout=worker_log, stderr=subprocess.STDOUT)
    processes.append(worker)
    for _ in range(100):
        worker_log.flush()
        if 'READY' in (OUT / 'worker.log').read_text():
            break
        if worker.poll() is not None:
            raise RuntimeError('toy worker exited early')
        time.sleep(0.03)
    else:
        raise RuntimeError('toy worker readiness timeout')
    pid = str(worker.pid)

    s = start('ps', 'ps: process, threads and wait channels')
    text = step(s, ['ps', '-p', pid, '-o', 'pid,ppid,stat,nlwp,comm'], 'One process can contain multiple Linux threads')
    check(s, 'tool_demo' in text and re.search(r'\b3\s+tool_demo', text) is not None, 'toy process has exactly three live threads')
    text = step(s, ['ps', '-L', '-p', pid, '-o', 'pid,tid,stat,wchan:28,comm'], 'Inspect the selected process, not every user process')
    check(s, text.count('tool_demo') == 3, 'thread view returns main and both worker threads')
    finish(s)

    s = start('lsof', 'lsof: deleted file and listening socket')
    text = step(s, ['lsof', '-nP', '-a', '-p', pid, '+L1'], 'Unlink removes a pathname, not an open file descriptor')
    check(s, 'sample.log (deleted)' in text, 'unlinked sample.log remains held by the toy process')
    text = step(s, ['lsof', '-nP', '-a', '-p', pid, '-iTCP', '-sTCP:LISTEN'], 'AND process and socket filters with -a')
    check(s, '127.0.0.1:' in text and '(LISTEN)' in text, 'toy TCP listener is loopback only')
    finish(s)

    s = start('pstack', 'pstack unavailable: inspect stacks with GDB',
              'Ubuntu ARM64 has no pstack binary here. The following all-thread stack command is an explicit alternative.')
    text = step(s, "if command -v pstack; then pstack --help; else printf 'pstack is not installed in this Ubuntu 22.04 image.\nUse the explicit GDB batch alternative below.\n'; fi", 'Check availability; do not pretend a missing tool ran')
    check(s, shutil.which('pstack') is None, 'pstack is absent; the alternative is explicitly labelled')
    text = step(s, ['gdb', '-q', '-nx', '-batch', '-ex', 'set pagination off', '-ex', 'thread apply all bt 5', '-p', pid],
                'A brief attach stops the toy threads; all stacks then detach')
    check(s, text.count('wait_for_job') >= 2 and 'Thread 3' in text and 'detached' in text,
          'batch alternative sees both wait_for_job stacks and detaches')
    finish(s)

    s = start('strace', 'strace: file success, ENOENT, and a short sleep')
    text = step(s, ['strace', '-f', '-e', 'trace=openat,read,close,clock_nanosleep,nanosleep', '-o', 'trace.log', './tool_demo', 'once'],
                'Trace a child that we launch, with output kept in a file')
    check(s, 'demo_add(2,3)=5' in text and 'missing_errno=2' in text, 'toy application computes correctly and sees ENOENT')
    text = step(s, "grep -E 'sample.txt|missing.txt|clock_nanosleep|nanosleep' trace.log", 'ENOENT is a failed lookup, not automatically the root cause')
    check(s, 'sample.txt' in text and 'ENOENT' in text and 'nanosleep' in text, 'trace records successful input, missing file and sleep syscall')
    finish(s)

    s = start('ipcs', 'ipcs: inspect only the shared memory we created')
    text = step(s, ['ipcmk', '-M', '4096'], 'Create a private 4096-byte teaching IPC object')
    match = re.search(r'Shared memory id:\s*(\d+)', text)
    check(s, match is not None, 'ipcmk returns the created shared-memory ID')
    ident = match.group(1)
    ipc_ids.append(ident)
    text = step(s, ['ipcs', '-m', '-i', ident], 'Inspect its owner, size and attachment count')
    check(s, 'bytes=4096' in text and 'nattch=0' in text, 'the selected object is 4096 bytes and unattached')
    step(s, f'ipcrm -m {ident} && ipcs -m', 'Remove that exact object, never a blanket IPC cleanup')
    ipc_ids.remove(ident)
    finish(s)

    s = start('top', 'top: batch snapshots, then thread snapshots')
    text = step(s, ['top', '-b', '-n', '2', '-d', '0.3', '-p', pid], 'Two samples of only our toy process; headers may be VM-wide')
    check(s, text.count('tool_demo') >= 2 and '%Cpu' in text, 'two batch process samples are present')
    text = step(s, ['top', '-H', '-b', '-n', '1', '-p', pid], 'Switch from process rows to thread rows')
    check(s, text.count('tool_demo') >= 3, 'thread mode lists all three toy threads')
    finish(s)

    s = start('free', 'free: available memory is not the same as free')
    text = step(s, ['free', '-h'], 'Read the available column before declaring memory pressure')
    check(s, 'available' in text and 'Mem:' in text, 'human-readable summary includes available memory')
    text = step(s, ['free', '-m', '-s', '1', '-c', '2'], 'Observe two samples; these may describe Docker VM memory')
    check(s, text.count('Mem:') == 2, 'interval mode records exactly two memory samples')
    finish(s)

    s = start('vmstat', 'vmstat: boot averages versus interval activity')
    text = step(s, ['vmstat', '1', '2'], 'First CPU/rate row since boot; gauges are current')
    check(s, 'swpd' in text and len(re.findall(r'^\s*\d+\s+\d+\s+', text, re.M)) == 2, 'two numeric vmstat rows are present')
    text = step(s, ['vmstat', '-s'], 'Review cumulative counters separately from per-second rates')
    check(s, 'total memory' in text and 'CPU context switches' in text, 'summary provides cumulative memory and context-switch counters')
    finish(s)

    s = start('iostat', 'iostat: CPU report and interval-only device report')
    text = step(s, ['iostat', '-c', '1', '2'], 'The initial CPU report is an average since boot')
    check(s, 'avg-cpu' in text and '%iowait' in text, 'CPU report contains iowait without asserting a bottleneck')
    text = step(s, ['iostat', '-dx', '-y', '1', '1'], 'Use -y to omit the since-boot report; device scope may be VM-wide')
    check(s, 'Device' in text and 'await' in text and '%util' in text, 'extended interval report has latency and utilization columns')
    finish(s)

    s = start('sar', 'sar: capture now, then replay the binary sample')
    text = step(s, ['sar', '-u', '-o', 'cpu.sar', '1', '2'], 'Collect two samples explicitly; no background collector required')
    check(s, 'Average:' in text and '%idle' in text and (WORK / 'cpu.sar').stat().st_size > 0, 'live CPU samples and a nonempty binary recording exist')
    text = step(s, ['sar', '-u', '-f', 'cpu.sar'], 'Read the recorded interval instead of inventing historical data')
    check(s, 'Average:' in text and '%idle' in text, 'sar replays the generated recording successfully')
    finish(s)

    s = start('readelf', 'readelf: ELF identity and dynamic dependencies')
    text = step(s, ['readelf', '-h', './tool_demo'], 'Read class, machine and ELF type before debugging ABI problems')
    check(s, 'ELF64' in text and 'Machine:' in text, 'header identifies a 64-bit ELF and its actual architecture')
    text = step(s, "readelf -d ./tool_demo | grep -E 'NEEDED|RUNPATH'", 'Dependencies and search paths are different ELF entries')
    check(s, 'libdemo.so' in text and '$ORIGIN' in text, 'dynamic section records the expected library and relative search path')
    finish(s)

    s = start('objdump', 'objdump: object sections and assembly with relocations')
    text = step(s, ['objdump', '-h', './symbols.o'], 'Section sizes belong to an ELF object, not live process RSS')
    check(s, '.text' in text and '.bss' in text, 'object contains code and zero-initialized storage sections')
    text = step(s, ['objdump', '-drC', './symbols.o'], 'Demangle C++ names and retain relocation records')
    check(s, 'demo::square(int)' in text and 'puts' in text and re.search(r'R_\w+', text), 'disassembly includes C++ function and unresolved puts relocation')
    finish(s)

    s = start('nm', 'nm: defined data, zero-fill, and undefined symbols')
    text = step(s, ['nm', '-C', './symbols.o'], 'D/B/t/U classify symbols; U means resolved later, not necessarily a bug')
    check(s, re.search(r'\bD initialized_counter', text) and re.search(r'\bB zero_buffer', text) and re.search(r'\bU puts', text),
          'initialized, zero-fill and undefined symbols have expected D/B/U types')
    text = step(s, ['nm', '-D', '--defined-only', './libdemo.so'], 'Dynamic exports differ from the full static symbol table')
    check(s, 'demo_add' in text, 'shared library exports demo_add dynamically')
    finish(s)

    s = start('size', 'size: compare code, initialized data and zero-fill')
    text = step(s, ['size', './symbols.o', './tool_demo'], 'The summary is ELF section accounting, not runtime memory usage')
    check(s, 'text' in text and 'data' in text and 'bss' in text and 'symbols.o' in text, 'Berkeley summary includes both fixtures')
    text = step(s, ['size', '-A', './symbols.o'], 'A 4096-byte zero array contributes to .bss')
    match = re.search(r'^\.bss\s+(\d+)', text, re.M)
    check(s, match is not None and int(match.group(1)) >= 4096, 'section view counts the zero_buffer allocation in .bss')
    finish(s)

    # Only a temporary HTTP service in the private network namespace, no ports.
    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(QuietHandler, directory=str(WORK))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    port = httpd.server_address[1]
    s = start('wget', 'wget: bounded local download and checksum comparison')
    text = step(s, ['wget', '--timeout=3', '--tries=1', '-O', 'downloaded.txt', f'http://127.0.0.1:{port}/payload.txt'],
                'A local fixture avoids external content, credentials and network variability')
    check(s, '200 OK' in text and (WORK / 'downloaded.txt').read_bytes() == (WORK / 'payload.txt').read_bytes(), 'HTTP succeeds and downloaded bytes match the original')
    text = step(s, ['sha256sum', 'payload.txt', 'downloaded.txt'], 'Compare bytes after transport, not just the exit code')
    check(s, text.count(sha(WORK / 'payload.txt')) == 2, 'both SHA-256 values are identical')
    finish(s)

    # An ephemeral same-user SSH server. No root daemon and no host SSH state.
    run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(WORK / 'host_key')])
    run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(WORK / 'client_key')])
    shutil.copy2(WORK / 'client_key.pub', WORK / 'authorized_keys')
    ssh_config = WORK / 'sshd_config'
    ssh_config.write_text('\n'.join([
        'Port 2222', 'ListenAddress 127.0.0.1', f'HostKey {WORK}/host_key',
        f'PidFile {WORK}/sshd.pid', f'AuthorizedKeysFile {WORK}/authorized_keys',
        'PasswordAuthentication no', 'KbdInteractiveAuthentication no', 'UsePAM no',
        'StrictModes no', 'PermitRootLogin no', 'AllowUsers learner',
        'Subsystem sftp internal-sftp', 'LogLevel VERBOSE', '']) )
    ssh_log = open(OUT / 'sshd.log', 'w')
    sshd = subprocess.Popen(['/usr/sbin/sshd', '-D', '-e', '-f', str(ssh_config)], cwd=WORK,
                            stdout=ssh_log, stderr=subprocess.STDOUT)
    processes.append(sshd)
    await_port(2222, sshd)
    run('ssh-keyscan -p 2222 127.0.0.1 > known_hosts')
    s = start('scp', 'scp: copy through an isolated key-only SSH server',
              'Local loopback only. Every scanned host-key entry is verified against the server public key generated in this same fixture. Private keys are temporary and never published.')
    public_fields = (WORK / 'host_key.pub').read_text().split()[:2]
    scanned_fields = [line.split()[1:3] for line in (WORK / 'known_hosts').read_text().splitlines() if line and not line.startswith('#')]
    check(s, bool(scanned_fields) and all(fields == public_fields for fields in scanned_fields),
          'scanned SSH key type and public-key bytes exactly match our generated server public key')
    text = step(s, 'ssh-keygen -lf host_key.pub && ssh-keygen -lf known_hosts',
                'Compare against the generated server key before trusting the scan')
    check(s, len(re.findall(r'SHA256:\S+', text)) == 2 and len(set(re.findall(r'SHA256:\S+', text))) == 1,
          'the known-hosts fingerprint equals the independently generated host-key fingerprint')
    text = step(s, ['scp', '-v', '-P', '2222', '-i', 'client_key', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
                    '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={WORK}/known_hosts',
                    'payload.txt', f'learner@127.0.0.1:{WORK}/received.txt'],
                'Uppercase -P selects the SSH port; host-key checking stays enabled')
    check(s, (WORK / 'received.txt').read_bytes() == (WORK / 'payload.txt').read_bytes(), 'scp transfers through SSH with identical destination bytes')
    text = step(s, ['sha256sum', 'payload.txt', 'received.txt'], 'Validate the destination contents, not an animated progress bar')
    check(s, text.count(sha(WORK / 'payload.txt')) == 2, 'source and SSH destination SHA-256 are equal')
    finish(s)

    s = start('crontab', 'crontab: permissions and a minimal job environment',
              'No cron daemon runs and no crontab is installed. no-new-privileges blocks setgid elevation, so listing can be denied. The second step simulates a minimal shell environment, not cron scheduling.')
    text = step(s, ['crontab', '-l'], 'This hardened container does not grant crontab setgid elevation', expected=(1,))
    check(s, 'no crontab for learner' in text or 'Permission denied' in text,
          'listing is empty or explicitly denied by the restricted container, without installing any schedule')
    text = step(s, ['env', '-i', 'PATH=/usr/bin:/bin', '/bin/sh', '/lab/cron_job.sh'],
                'Minimal-environment reproduction, not a real cron timer')
    check(s, 'PATH=/usr/bin:/bin' in text and sha(WORK / 'payload.txt') in text, 'job works with explicitly declared PATH and absolute data path')
    finish(s)

    if len(sessions) != 18 or any(s['status'] != 'passed' for s in sessions):
        raise AssertionError('all 18 sessions must pass')
    (OUT / 'recorded-sessions.json').write_text(json.dumps(sessions, indent=2))
    (OUT / 'full-transcript.txt').write_text('\n'.join(transcript))
    validation = dict(provenance, scenarios=[dict(id=s['id'], status=s['status'], checks=s['checks']) for s in sessions],
                      recorded_sessions_sha256=sha(OUT / 'recorded-sessions.json'),
                      full_transcript_sha256=sha(OUT / 'full-transcript.txt'))
    (OUT / 'validation.json').write_text(json.dumps(validation, indent=2))
    write_state('passed', image_id=provenance['image_id'],
                recorded_sessions_sha256=sha(OUT / 'recorded-sessions.json'),
                validation_sha256=sha(OUT / 'validation.json'),
                full_transcript_sha256=sha(OUT / 'full-transcript.txt'))
    print(f'All {len(sessions)} sessions passed; {sum(len(s["checks"]) for s in sessions)} semantic assertions.', flush=True)


try:
    write_state('running')
    main()
except BaseException as error:
    write_state('failed', error=f'{type(error).__name__}: {error}')
    raise
finally:
    for child in reversed(processes):
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=3)
    for ident in ipc_ids:
        subprocess.run(['ipcrm', '-m', ident], check=False)
    if httpd is not None:
        httpd.shutdown()
        httpd.server_close()
    # Preserve raw evidence even when a check fails, but do not publish a passed
    # summary from a partial run. Failed runs leave the previous snapshot alone.
    (OUT / 'last-attempt-transcript.txt').write_text('\n'.join(transcript))
