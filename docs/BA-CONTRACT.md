# BA worker adapter contract — đề xuất, chưa nối web

## Baseline thực tế

Remote đã đọc ở commit `9f786144e4a84361a373abacf45107c26c2c0262`, agent `0.2.0`, canonical schema `0.2`. Không tự coi đây là v0.2.1. [Reference manifest](../contracts/ba-agent.reference.json) lưu commit/checksum; không copy core hoặc canonical schemas vào platform. [Khảo sát](REPOSITORY-SURVEY.md) ghi hai thời điểm remote thay đổi.

Web hiện gọi simulator tạo `platform-draft/1`, không gọi CLI dưới đây. Contract worker invocation trong `contracts/agent-invocation.schema.json` là đề xuất được kiểm tra cấu trúc, chưa là runtime protocol của background simulator. Phân biệt rõ envelope platform, canonical BA context/proposal và provider projection.

## Điểm tích hợp

Adapter tương lai chạy subprocess với argv allowlist trong checkout BA được pin/read-only và interpreter venv riêng. Context/proposal/output đặt trong thư mục run do server quản lý, không trong repo BA. Không shell interpolation theo input. Không lấy path, environment hoặc command từ model/notes. Worker không có credential Telegram hay quyền ghi vào hệ thống nghiệp vụ.

Chế độ slice tiếp theo:

```text
<ba-python> <pinned-ba-root>/agent.py --context <trusted-context.json> --prepare --output <run-dir>/prepared
<ba-python> <pinned-ba-root>/agent.py --context <trusted-context.json> --proposal <supplied-proposal.json> --output <run-dir>/packs
```

Chưa bật `--live`. BA live code có retry tối đa 2 và timeout 180s/lần nhưng chưa có dollar/token cap hoặc enforced isolation. Invocation contract đề xuất cho supplied-proposal/prepare giới hạn 30s; deadline 20s của simulator hiện tại là policy riêng. Không áp deadline simulator vào BA live và gọi đó là đã enforce live budget.

## Input và trusted context

Canonical `schemas/context.schema.json` yêu cầu đúng các field (additionalProperties=false):

```text
schema_version, project, objective, method, audience, pm_owner, mode,
data_authorization, contract_type, authorized_requesters, authorized_reviewers,
client_approver, internal_approver, sow_source_id, change_process_ref,
acceptance_process_ref, data_policy_ref, baseline_ref, principals, reviews, sources
```

`sources[]` gồm id/version/content_hash/text; hash là SHA-256 exact text UTF-8, evidence line bắt đầu từ 1. Context xác định authority/principals/authorized reviewers/reviews phải do application/operator đáng tin cậy quản lý. Notes và câu trả lời chưa được xác minh không được tạo thẩm quyền, `data_authorization=true` hoặc review confirmation. Client mode cần SOW/contract/requester/approver/change/acceptance process hợp lệ. Prototype hiện chưa đủ identity/authority data để tự tạo trusted context thật từ một ô notes.

Proposal canonical yêu cầu `summary, requirements, stories, questions, conflicts, handoffs, schema_version, trace_links`. Requirements/stories/AC có provenance, evidence, revision và field-level claims. `model_projection()` là provider schema, không được dùng thay canonical và domain validation.

Platform review hiện ghi nhận toàn pack theo artifact_id/version. BA `reviews[]` lại cần target_id/target_revision/field/content_hash/reviewer_id/decision/recorded_at/evidence_ref. **Không tự chuyển “Đã review” toàn pack thành xác nhận mọi claim của BA.** Tích hợp field review phải làm riêng và dùng đúng `domain.review_hash`/authority rules.

## Output / trạng thái / exit code

| CLI result state | Exit | Platform mapping đề xuất | Xử lý |
|---|---:|---|---|
| AwaitingInput | 2 | waiting_input | Lưu questions từ preflight; không tạo pack thành công |
| AwaitingProposal | 2 | waiting_proposal | Chuẩn bị prompt/schema, chờ proposal do operator cung cấp |
| Escalated | 2 | needs_operator | Lưu lỗi/gate findings; không import accepted pack |
| AwaitingPMReview | 0 | awaiting_review | Import pack sau integrity/schema checks, không auto-approve |
| Missing/malformed JSON / nonzero khác | khác | failed | Phân loại worker/runtime lỗi, bounded retry theo policy |

Không coi exit 2 mặc nhiên là process crash. CLI `--prepare` sau preflight thành công vẫn exit 2 do trạng thái AwaitingProposal. `--demo` dùng proposal fixture; không chứng minh model quality.

Pack gồm `bundle.json`, `review-pack.md`, `audit.json`, `manifest.json`, dưới thư mục hash của run. Bundle có `agent_version, schema_version, project, state, baseline_status, uat_signoff, ba_verification, business_validation, requirements, stories, tests, rtm, review_findings` và phần proposal liên quan. `AwaitingPMReview` không tương đương BA verified, TeamReady, baseline hoặc UAT passed. Story có thể Blocked trong một pack hợp lệ.

## Import và handoff được phép

Adapter phải xác minh trước import (chưa triển khai ở web):

1. Checkout SHA và schema/dependency fingerprints đúng registry; platform-generated invocation đúng schema.
2. Result output path resolved ở trong run root do worker tạo; chặn symlink/path traversal; giới hạn stdout/file size. CLI hiện giới hạn load input/output JSON 200 KB.
3. Manifest file set, full run_hash, từng artifact checksum đúng; bundle canonical/domain validation của harness không bị bỏ qua. Lưu raw pack bất biến cạnh normalized read model.
4. Mọi source/artifact/parent step cùng project và được cấp quyền tại thời điểm chạy. Idempotency theo project/run/step/input hash/agent commit; replay chỉ reuse pack nguyên vẹn.
5. Handoff BA chỉ là proposal `{target, reason, requirement_ids}`. Orchestrator resolve target qua allowlist registry/workflow, xét quyền/schema/budget/deadline/hop count. Unknown target hoặc vòng lặp → operator, không chạy command do agent đưa ra.
6. Chỉ trao dữ liệu structured cần thiết, kèm input/output hash và lineage; không chuyển credential hay toàn bộ conversation mặc định. Timeout/cancel kill process tree và không publish partial pack.

Technical check, business validation và approval vẫn là các gate riêng. Telegram không nhận raw internal BA review pack mặc định vì renderer của agent hiện internal-only, chưa có client-safe filter.

## Bằng chứng đang có

Đã chạy unittest và CLI demo fixture độc lập, integrity manifest đã được xác minh; output nằm `.local/ba-smoke`. Web integration test cho adapter/manifest import, field-level trusted reviews và live provider đều **chưa chạy/chưa triển khai**. Xem VALIDATION.md.
