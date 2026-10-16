"""Executed by the pinned BA interpreter; independently revalidate its accepted output."""
import json
import sys
from pathlib import Path

def main():
    source, context_path, proposal_path, bundle_path, audit_path = map(Path, sys.argv[1:])
    sys.path.insert(0, str(source))
    import agent
    context = agent.load_json(context_path)
    proposal = agent.load_json(proposal_path)
    bundle = json.loads(bundle_path.read_text())
    audit = json.loads(audit_path.read_text())
    if agent.preflight(context) or agent.validate(proposal, context):
        raise ValueError('Canonical/domain input validation failed')
    agent.shape(bundle, json.loads((source/'schemas/bundle.schema.json').read_text()))
    if bundle != agent.compile_bundle(proposal, context):
        raise ValueError('Bundle does not match the validated input/proposal')
    fingerprints = agent.fingerprints()
    expected = agent.digest({'context':context,'proposal':proposal,'version':agent.VERSION,'fingerprints':fingerprints,
                             'adapter':'supplied-proposal','requested_model':None})
    if (audit['run_hash'] != expected or audit['input_hash'] != agent.digest(context)
            or audit['fingerprints'] != fingerprints or audit['adapter'] != 'supplied-proposal'
            or audit['agent_version'] != agent.VERSION):
        raise ValueError('Audit provenance differs')
    print(json.dumps({'run_hash':expected,'canonical_schema':'passed','domain_validation':'passed'}))

if __name__=='__main__':
    main()
