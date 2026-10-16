"""Bounded supplied-proposal CLI adapter. All paths are server-owned; no live mode."""
import hashlib
import json
import os
import re
import signal
import subprocess
from pathlib import Path
from . import ba_runtime

WORKFLOW = 'ba-harness-fixture'
PROJECT_WORKFLOW = 'ba-project-proposal'
WORKFLOWS = {WORKFLOW, PROJECT_WORKFLOW}
FILES = {'proposal.json','bundle.json','review-pack.md','audit.json','manifest.json'}
MAX_PACK_FILE = 4_000_000

class AdapterError(Exception):
    pass

class PackIntegrityError(AdapterError):
    pass

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)

def invoke(args, cwd, timeout=15):
    env = os.environ.copy()
    env['PYTHONDONTWRITEBYTECODE'] = '1'
    # No stdin, shell or model flags. Inherited authentication is never logged or serialized.
    with subprocess.Popen([str(a) for a in args],cwd=cwd,env=env,stdin=subprocess.DEVNULL,
                          stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True) as p:
        try:
            stdout, _ = p.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(p.pid,signal.SIGKILL)
            p.communicate()
            raise AdapterError('BA subprocess timeout') from None
    if len(stdout)>1_000_000:
        raise AdapterError('BA stdout limit exceeded')
    try:
        result = json.loads(stdout)
    except (ValueError,UnicodeError):
        raise AdapterError('BA result is not JSON') from None
    if not isinstance(result,dict):raise AdapterError('BA result is not an object')
    return p.returncode,result

def read_files(destination, output_root):
    # Resolve only canonical hash directories within this invocation, with no symlinks.
    destination = Path(destination)
    root = Path(output_root).resolve()
    if (destination.is_symlink() or destination.parent.resolve()!=root
            or not re.fullmatch(r'[a-f0-9]{20}',destination.name)):
        raise PackIntegrityError('Pack path is outside the invocation output root')
    if not destination.is_dir() or {p.name for p in destination.iterdir()} != FILES:
        raise PackIntegrityError('Unexpected pack file set')
    raw={}
    for name in FILES:
        p=destination/name
        if p.is_symlink() or not p.is_file() or p.stat().st_size>MAX_PACK_FILE:
            raise PackIntegrityError('Invalid pack file: '+name)
        raw[name]=p.read_bytes().decode('utf-8')
    try:
        manifest=json.loads(raw['manifest.json'])
        hashes=manifest['files']
        if not isinstance(manifest,dict) or not isinstance(hashes,dict):raise ValueError()
        if set(hashes)!=FILES-{'manifest.json'} or not re.fullmatch(r'[a-f0-9]{64}',manifest['run_hash']):
            raise ValueError()
        if destination.name!=manifest['run_hash'][:20]:raise ValueError()
        for name,expected in hashes.items():
            if hashlib.sha256((destination/name).read_bytes()).hexdigest()!=expected:raise ValueError()
    except (KeyError,TypeError,ValueError):
        raise PackIntegrityError('Manifest/hash verification failed') from None
    return raw,manifest

def execute(invocation, output_root):
    source=ba_runtime.source();python=ba_runtime.interpreter()
    root=Path(output_root)
    if root.is_symlink():raise PackIntegrityError('Invocation root cannot be a symlink')
    root=root.resolve()
    root.mkdir(parents=True,exist_ok=True)
    context=json.loads(invocation['context_json']);proposal=json.loads(invocation['proposal_json'])
    if invocation['agent_commit']!=ba_runtime.REFERENCE['commit']:
        raise PackIntegrityError('Invocation agent commit differs from registry')
    expected=hashlib.sha256(canonical({'context':context,'proposal':proposal}).encode()).hexdigest()
    if invocation['input_hash']!=expected:raise PackIntegrityError('Input snapshot hash mismatch')
    context_path=root/'context.json';proposal_path=root/'proposal.json'
    for path,value in [(context_path,context),(proposal_path,proposal)]:
        content=canonical(value)+'\n'
        if path.exists():
            if path.is_symlink() or path.read_text()!=content:raise PackIntegrityError('Input snapshot changed')
        else:
            with path.open('x') as f:f.write(content)
    packs=root/'packs'
    if packs.is_symlink():raise PackIntegrityError('Pack root cannot be a symlink')
    code,result=invoke([python,'-B',source/'agent.py','--context',context_path,'--proposal',proposal_path,'--output',packs],root)
    state=result.get('state')
    if code==2 and state in {'AwaitingInput','AwaitingProposal','Escalated'}:
        return {'state':state,'result':result}
    if code!=0 or state!='AwaitingPMReview':raise AdapterError('Unexpected BA exit/state combination')
    raw,manifest=read_files(result.get('output',''),packs)
    if json.loads(raw['proposal.json']) != proposal:
        raise PackIntegrityError('Pack proposal differs from invocation snapshot')
    destination=Path(result['output'])
    try:
        verify_code,verified=invoke([python,'-B','-I',ba_runtime.ROOT/'backend/ba_verify.py',source,context_path,proposal_path,destination/'bundle.json',destination/'audit.json'],root,timeout=10)
    except AdapterError:
        raise PackIntegrityError('Independent canonical/domain verification failed') from None
    if verify_code!=0 or verified.get('run_hash')!=manifest['run_hash']:
        raise PackIntegrityError('Independent canonical/domain verification failed')
    # Re-read hashes after the validator to reject changes between validation and import.
    final_raw,_=read_files(destination,packs)
    if raw!=final_raw:raise PackIntegrityError('Pack changed while verifying')
    return {'state':state,'result':{'state':state,'reused':bool(result.get('reused')),'run_hash':manifest['run_hash'],**verified},
            'files':raw,'bundle':json.loads(raw['bundle.json'])}

def view(bundle, context, run_hash, workflow=WORKFLOW):
    return dict(schema_version='ba-view/1',mode=workflow,title='BA · '+bundle['project'],summary=bundle['summary'],
        source_id='BA context snapshot',source_hash=hashlib.sha256(canonical(context).encode()).hexdigest(),
        answer='Supplied proposal; không có model sinh nội dung. Principal/review trong prototype không phải danh tính thật.',
        change_request='',uat_status='Not Started',
        requirements=[dict(id=r['id'],title=r['description'],description=r['business_need'],
            evidence='; '.join(f'{e["source_id"]}:L{e["line"]} ({e["source_version"]}) — {e["quote"]}' for e in r['evidence']),priority=r['priority']+' · đề xuất') for r in bundle['requirements']],
        # The BA-specific UI renders all canonical AC/RTM/tests below; this index is for shared cards only.
        stories=[dict(id=s['id'],requirement_id=', '.join(s['requirement_ids']),text=f'As a {s["role"]}, I want {s["goal"]}, so that {s["benefit"]}.',
            given='',when='',then='') for s in bundle['stories']],
        ba_bundle=bundle,ba_sources=context['sources'],origin=dict(adapter='ba-cli-supplied-proposal',agent_commit=ba_runtime.REFERENCE['commit'],
            agent_version=bundle['agent_version'],run_hash=run_hash,validation='canonical+domain+manifest'))
