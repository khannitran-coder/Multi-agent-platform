"""Pinned BA source dependency: integrity checks only, never downloads at request time."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = json.loads((ROOT / 'contracts/ba-agent.reference.json').read_text())
FILE_HASHES = json.loads((ROOT / 'contracts/ba-runtime.files.json').read_text())
RUNTIME = ROOT / '.local/agent-runtimes/ba' / REFERENCE['commit']

class RuntimeIntegrityError(Exception):
    pass

def verify_source(source):
    source = Path(source)
    if source.is_symlink() or not source.is_dir():
        raise RuntimeIntegrityError('BA runtime chưa cài; chạy python3 scripts/prepare_ba_runtime.py.')
    actual = {str(p.relative_to(source)) for p in source.rglob('*') if p.is_file() or p.is_symlink()}
    if actual != set(FILE_HASHES):
        raise RuntimeIntegrityError('BA runtime file set differs from pinned Git tree.')
    for name, expected in FILE_HASHES.items():
        p = source / name
        if p.is_symlink() or hashlib.sha256(p.read_bytes()).hexdigest() != expected:
            raise RuntimeIntegrityError('BA runtime integrity mismatch: '+name)
    return source

def source():
    return verify_source(RUNTIME / 'source')

def interpreter():
    p = RUNTIME / 'venv/bin/python'
    if not p.exists():
        raise RuntimeIntegrityError('BA interpreter chưa cài; chạy python3 scripts/prepare_ba_runtime.py.')
    return p

def fixtures():
    root = source()
    return (json.loads((root/'examples/context.json').read_text()),
            json.loads((root/'examples/proposal.json').read_text()))
