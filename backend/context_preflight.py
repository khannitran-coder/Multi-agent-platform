"""Read-only canonical checks executed by the pinned BA interpreter; no model/pack."""
import json
import sys
from pathlib import Path

source, context_path = map(Path, sys.argv[1:])
sys.path.insert(0, str(source))
from contracts import CONTEXT_SCHEMA, errors
from domain import preflight
context = json.loads(context_path.read_text())
schema = errors(context, CONTEXT_SCHEMA)
print(json.dumps({'schema_findings': schema, 'preflight_findings': preflight(context)}, ensure_ascii=False))
