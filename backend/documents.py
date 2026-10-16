"""Immutable documents/versions; extracted sources bridge to existing BA contracts."""
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path
from . import store as db, ba_adapter

MAX_UPLOAD = 5 * 1024 * 1024
MIMES = {'.txt': {'text/plain'}, '.md': {'text/plain', 'text/markdown', 'text/x-markdown'},
         '.pdf': {'application/pdf'},
         '.docx': {'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}}

def safe_name(filename, mime):
    mime=mime.split(';',1)[0].strip().lower()
    name = unicodedata.normalize('NFKC', filename or '')
    if '/' in name or '\\' in name or '..' in name or any(ord(c) < 32 for c in name):
        raise ValueError('Tên file không hợp lệ. Chọn file có tên thông thường, không chứa đường dẫn.')
    name = re.sub(r'[^\w.() -]', '_', name, flags=re.UNICODE).strip(' .')[:160]
    extension = Path(name).suffix.lower()
    if not name or extension not in MIMES: raise ValueError('Chỉ nhận TXT, Markdown (.md), PDF và DOCX.')
    if mime not in MIMES[extension] | {'application/octet-stream', ''}:
        raise ValueError('Định dạng nội dung khai báo không khớp phần mở rộng file.')
    return name, extension

def root():
    path = db.DB.resolve().parent/'uploads'; path.mkdir(parents=True, exist_ok=True)
    return path

def parse(data, extension):
    vid = db.uid('docver'); path = root()/(vid+extension)
    path.write_bytes(data)
    try:
        code, result = ba_adapter.invoke([sys.executable, '-I', Path(__file__).with_name('document_parser.py'), path, extension], root(), timeout=10)
        if code != 0: raise ValueError(result.get('error', 'Không đọc được tệp.'))
        if result.get('status') not in ('ready', 'needs_text') or not isinstance(result.get('text'), str):
            raise ValueError('Parser không trả về kết quả hợp lệ.')
        return vid, path.name, result
    except Exception:
        path.unlink(missing_ok=True)
        raise

def list_project(c, pid):
    docs = db.rows(c, 'SELECT * FROM documents WHERE project_id=? ORDER BY rowid DESC', (pid,))
    for doc in docs:
        doc['versions'] = db.rows(c, 'SELECT * FROM document_versions WHERE document_id=? ORDER BY version DESC', (doc['id'],))
        for version in doc['versions']: version.pop('storage_name')
    return docs

def versions(c, pid, ids):
    rows = []
    for vid in ids:
        row = c.execute('''SELECT v.*,d.name,d.kind,d.project_id,s.text,s.hash text_hash,s.version source_version
            FROM document_versions v JOIN documents d ON d.id=v.document_id
            LEFT JOIN sources s ON s.id=v.source_id WHERE v.id=? AND d.project_id=?''', (vid,pid)).fetchone()
        if not row: raise ValueError('Phiên bản tài liệu không thuộc project hoặc không tồn tại.')
        if row['status'] != 'ready' or not row['source_id']:
            raise ValueError('Tài liệu chưa đọc được. Link Drive cần kết nối; PDF scan cần bản có text.')
        rows.append(dict(row))
    if sum(len(r['text'].encode()) for r in rows) > 100_000:
        raise ValueError('Tổng text được chọn vượt 100 KB; chọn ít tài liệu hơn.')
    return rows

def job_input(c, rid, rows):
    snapshot = [{**{k: r[k] for k in ('id','document_id','name','version','source_id','text_hash','text','source_version')},'file_hash':r['hash']} for r in rows]
    raw = ba_adapter.canonical(snapshot)
    c.execute('INSERT INTO job_inputs VALUES (?,?,?)', (rid, raw, db.digest(raw)))
    return snapshot

def demo_source(c, run):
    raw = c.execute('SELECT * FROM job_inputs WHERE run_id=?', (run['id'],)).fetchone()
    if db.digest(raw['documents_json']) != raw['input_hash']: raise ValueError('Job input hash mismatch')
    docs = json.loads(raw['documents_json'])
    # Per-document sampling avoids silently dropping the second/third selected document.
    text = '\n'.join(line for d in docs for line in d['text'].splitlines() if line.strip())
    return {'id': 'job:'+run['id'], 'text': text, 'version': 1, 'hash': raw['input_hash']}, docs
