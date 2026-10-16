#!/usr/bin/env python3
"""Install immutable BA Git archive as an ignored dependency, without another checkout."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.ba_runtime import RUNTIME, REFERENCE, FILE_HASHES, verify_source

def main():
    RUNTIME.mkdir(parents=True, exist_ok=True)
    src = RUNTIME/'source'
    if not src.exists():
        with tempfile.TemporaryDirectory(prefix='ba-dependency-') as work:
            git = Path(work)/'git'
            git_env=os.environ.copy();git_env['GIT_TERMINAL_PROMPT']='0'
            subprocess.run(['git','clone','--no-checkout','https://github.com/'+REFERENCE['repository']+'.git',str(git)],check=True,env=git_env)
            subprocess.run(['git','-C',str(git),'checkout','--detach',REFERENCE['commit']],check=True)
            staging = Path(work)/'source'
            staging.mkdir()
            # Export every pinned tracked byte; no .git directory is installed in /workspace.
            for name, expected in FILE_HASHES.items():
                data = subprocess.check_output(['git','-C',str(git),'show',REFERENCE['commit']+':'+name])
                if hashlib.sha256(data).hexdigest()!=expected:
                    raise RuntimeError('Pinned Git blob differs: '+name)
                p=staging/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
            verify_source(staging)
            shutil.copytree(staging,src)
    verify_source(src)  # fail instead of repairing a modified runtime silently
    python = RUNTIME/'venv/bin/python'
    if not python.exists():
        venv.EnvBuilder(with_pip=True).create(RUNTIME/'venv')
    subprocess.run([str(python),'-m','pip','install','--cache-dir',str(ROOT/'.local/pip-cache'),'-r',str(src/'requirements.lock.txt')],check=True)
    subprocess.run([str(python),'-m','pip','check'],check=True)
    for p in src.rglob('*'):
        if p.is_file(): p.chmod(0o444)
    print(json.dumps({'installed':str(RUNTIME),'commit':REFERENCE['commit'],'agent_version':REFERENCE['observed_agent_version'],'git_checkout_created':False}))

if __name__=='__main__':
    main()
