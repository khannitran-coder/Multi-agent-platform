"""SQLite persistence. Every mutation is transactional; original versions are retained."""
import hashlib
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB = Path(os.environ.get('PLATFORM_DB', Path(__file__).resolve().parents[1] / '.local/platform.db'))
ACTOR = 'demo-pm'

def now():
    return datetime.now(timezone.utc).isoformat()

def uid(prefix):
    return prefix + '-' + uuid.uuid4().hex[:12]

def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()

@contextmanager
def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        # Serialize worker and HTTP read-modify-write operations, including duplicate submissions.
        conn.execute('BEGIN IMMEDIATE')
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def rows(c, sql, args=()):
    return [dict(r) for r in c.execute(sql, args).fetchall()]

def event(c, project, run, kind, detail, actor=ACTOR):
    c.execute('INSERT INTO events VALUES (?,?,?,?,?,?,?)', (uid('evt'), project, run, kind, detail, actor, now()))

def message(c, run, role, text):
    c.execute('INSERT INTO messages VALUES (?,?,?,?,?)', (uid('msg'), run, role, text, now()))

def create_project(c, name, objective, notes):
    pid, sid = uid('prj'), uid('src')
    c.execute('INSERT INTO projects VALUES (?,?,?,?,?)', (pid, name, objective, ACTOR, now()))
    c.execute('INSERT INTO memberships VALUES (?,?,?)', (pid, ACTOR, 'owner'))
    c.execute('INSERT INTO sources VALUES (?,?,?,?,?,?,?)', (sid, pid, 'Discovery notes', notes, 1, digest(notes), now()))
    event(c, pid, None, 'project.created', 'Project và notes v1 đã được lưu cục bộ.')
    return pid

def init():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB) as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT,objective TEXT,owner TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS memberships(project_id TEXT REFERENCES projects(id),user_id TEXT,role TEXT,PRIMARY KEY(project_id,user_id));
        CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),name TEXT,text TEXT,version INTEGER,hash TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),workflow TEXT,state TEXT,step TEXT,version INTEGER,turns INTEGER,attempts INTEGER,due REAL,created_at TEXT,updated_at TEXT,source_id TEXT REFERENCES sources(id),feedback TEXT);
        CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,run_id TEXT REFERENCES runs(id),role TEXT,text TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),run_id TEXT REFERENCES runs(id),version INTEGER,content TEXT,hash TEXT,technical TEXT,business TEXT,approval TEXT,created_at TEXT,UNIQUE(run_id,version));
        CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,artifact_id TEXT REFERENCES artifacts(id),decision TEXT,comment TEXT,actor TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),run_id TEXT REFERENCES runs(id),kind TEXT,detail TEXT,actor TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),run_id TEXT REFERENCES runs(id),text TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS channels(project_id TEXT PRIMARY KEY REFERENCES projects(id),enabled INTEGER,schedule TEXT,updated_at TEXT);
        ''')
    with connect() as c:
        if not c.execute('SELECT 1 FROM projects').fetchone():
            create_project(c, 'Atlas · Customer Portal', 'Chuẩn hóa yêu cầu cho cổng tự phục vụ khách hàng, trước khi đưa vào sprint.',
                'Khách hàng cần tạo yêu cầu hỗ trợ và xem tiến độ xử lý.\nPM cần review các yêu cầu trước khi bàn giao cho đội phát triển.\nCần thông báo khi yêu cầu bị chặn. Chưa thống nhất ai phê duyệt và phạm vi thông báo.')
