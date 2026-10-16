"""Prototype input contracts; simulator Draft is distinct from the canonical BA bundle."""
import json
from pathlib import Path
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class ProjectInput(Strict):
    name: str = Field(min_length=2, max_length=120)
    objective: str = Field(min_length=3, max_length=2000)
    notes: str = Field(min_length=10, max_length=20000)

class TextInput(Strict):
    text: str = Field(min_length=3, max_length=5000)

class SourceInput(TextInput):
    name: str = Field(default='Discovery notes', min_length=1, max_length=120)

class ContextInput(Strict):
    source_ids: list[str] = Field(min_length=1, max_length=20)
    mode: Literal['internal', 'client'] = 'internal'
    method: str = Field(default='Agile', max_length=120)
    audience: str = Field(default='PM, dev và QA', max_length=500)
    pm_owner: str = Field(default='', max_length=120)
    internal_approver: str = Field(default='', max_length=120)
    client_approver: str = Field(default='', max_length=120)
    contract_type: str = Field(default='', max_length=120)
    sow_source_id: str = Field(default='', max_length=120)
    change_process_ref: str = Field(default='', max_length=500)
    acceptance_process_ref: str = Field(default='', max_length=500)
    synthetic_only: bool = False

    @model_validator(mode='after')
    def unique_sources(self):
        if len(self.source_ids) != len(set(self.source_ids)):
            raise ValueError('Mỗi phiên bản nguồn chỉ được chọn một lần.')
        if self.sow_source_id and self.sow_source_id not in self.source_ids:
            raise ValueError('SOW phải thuộc danh sách nguồn đã chọn.')
        return self

class RunInput(Strict):
    workflow: Literal['requirements-discovery', 'ba-draft', 'ba-harness-fixture'] = 'requirements-discovery'
    proposal: dict | None = None

    @model_validator(mode='after')
    def bounded_proposal(self):
        if self.proposal is not None:
            if self.workflow != 'ba-harness-fixture':
                raise ValueError('Proposal JSON chỉ dùng cho workflow BA Harness Fixture.')
            if len(json.dumps(self.proposal,ensure_ascii=False,allow_nan=False).encode()) > 200_000:
                raise ValueError('Proposal vượt giới hạn 200 KB.')
        return self

class ReviewInput(Strict):
    decision: Literal['reviewed', 'needs_changes']
    comment: str = Field(min_length=3, max_length=5000)

class ChannelInput(Strict):
    enabled: bool
    schedule: Literal['daily', 'blockers', 'manual']

class Requirement(Strict):
    id: str
    title: str
    description: str
    evidence: str
    priority: str

class Story(Strict):
    id: str
    requirement_id: str
    text: str
    given: str
    when: str
    then: str

class Draft(Strict):
    schema_version: Literal['platform-draft/1']
    mode: Literal['simulation']
    title: str
    summary: str
    source_id: str
    source_hash: str
    answer: str
    change_request: str
    requirements: list[Requirement] = Field(min_length=1)
    stories: list[Story] = Field(min_length=1)
    uat_status: Literal['Not Started']

BA_REFERENCE = json.loads((Path(__file__).resolve().parents[1] / "contracts/ba-agent.reference.json").read_text())

REGISTRY = [
    dict(id='ba', name='BA Requirements', version=BA_REFERENCE['observed_agent_version'], commit=BA_REFERENCE['commit'], category='Discovery', capability='Requirements · Stories · AC · RTM · UAT plan', mode='simulation', input_schema='context.schema.json @ 9f786144', output_schema='bundle.schema.json @ 9f786144', platform_output='platform-draft/1', available=True),
    dict(id='qa', name='QA Reviewer', version='fixture-1', category='Quality', capability='Rà soát cấu trúc bản nháp và coverage', mode='simulation', input_schema='platform-draft/1', output_schema='qa-fixture/1', available=True),
    dict(id='snapshot', name='Snapshot Writer', version='fixture-1', category='Reporting', capability='Tóm tắt run từ dữ liệu project', mode='simulation', input_schema='run-summary/1', output_schema='snapshot/1', available=True),
    dict(id='risk', name='Risk Monitor', version='planned', category='Monitoring', capability='Tương quan tín hiệu và cảnh báo blocker', mode='planned', input_schema='Chưa đăng ký', output_schema='Chưa đăng ký', available=False),
    dict(id='progress', name='Progress Tracker', version='planned', category='Monitoring', capability='Theo dõi tiến độ và chênh lệch kế hoạch', mode='planned', input_schema='Chưa đăng ký', output_schema='Chưa đăng ký', available=False),
]
