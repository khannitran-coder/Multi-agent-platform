"""Preparation snapshots are never executable authority or an agent invocation."""
import json
import tempfile
from pathlib import Path
from . import ba_adapter, ba_runtime, store as db

AUTHORITY_BLOCKERS = [
    'Danh tính hiện tại là demo-pm cố định; chưa xác thực người dùng và thẩm quyền theo project.',
    'Vai trò khai báo chỉ để chuẩn bị context; chưa có bằng chứng cấp quyền được kiểm chứng.',
    'Chỉ cho phép chạy thử supplied-proposal với nguồn project giả lập khớp chính xác. Chưa cấp quyền chạy model hoặc dữ liệu thật.',
]

def build(project, sources, body):
    names = list(dict.fromkeys(x for x in [body.pm_owner, body.internal_approver, body.client_approver] if x))
    return {
        'schema_version': '0.2', 'project': project['name'], 'objective': project['objective'],
        'method': body.method, 'audience': body.audience, 'pm_owner': body.pm_owner,
        'mode': body.mode, 'data_authorization': body.synthetic_only,
        'contract_type': body.contract_type or None, 'authorized_requesters': [body.pm_owner] if body.pm_owner else [],
        'authorized_reviewers': [body.pm_owner] if body.pm_owner else [],
        'client_approver': body.client_approver or None, 'internal_approver': body.internal_approver,
        'sow_source_id': body.sow_source_id or None, 'change_process_ref': body.change_process_ref or None,
        'acceptance_process_ref': body.acceptance_process_ref or None,
        'data_policy_ref': 'Prototype synthetic-only declaration; not a real data processing grant' if body.synthetic_only else '',
        'baseline_ref': None, 'reviews': [],
        'principals': [{'id': name, 'role': 'Unverified prototype declaration',
                        'authority_evidence_ref': 'Unverified; preparation only, never dispatch authority'} for name in names],
        'sources': [{'id': s['id'], 'version': 'v'+str(s['version']), 'content_hash': s['hash'], 'text': s['text']} for s in sources],
    }

def check(context):
    source = ba_runtime.source(); python = ba_runtime.interpreter()
    db.DB.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='context-check-', dir=db.DB.parent) as directory:
        path = Path(directory)/'context.json'; path.write_text(ba_adapter.canonical(context), encoding='utf-8')
        code, result = ba_adapter.invoke([python, '-B', '-I', ba_runtime.ROOT/'backend/context_preflight.py', source, path], directory, timeout=10)
    if code != 0 or not isinstance(result.get('schema_findings'), list) or not isinstance(result.get('preflight_findings'), list):
        raise ba_adapter.AdapterError('Invalid preflight result')
    return {**result, 'technical': 'passed' if not result['preflight_findings'] else 'needs_input',
            'execution': 'blocked', 'authority_blockers': AUTHORITY_BLOCKERS,
            'business': 'pending', 'approval': 'not_approved'}

def serialize(row):
    value = dict(row)
    for key in ['context_json', 'input_json', 'result_json']:
        value[key.removesuffix('_json')] = json.loads(value.pop(key))
    return value
