# BA fixture integration — v0.2 platform slice

## Luồng chạy được

Chọn project → Agent & Workflow → BA Harness Fixture → supplied proposal (mặc định fixture, có thể chỉnh JSON) → worker → BA CLI → kiểm tra pack → artifact → review.

Fixture dùng đúng context/proposal công nợ từ commit BA `9f786144e4a84361a373abacf45107c26c2c0262`, code vẫn version `0.2.0`. Đây là chạy harness thật trên dữ liệu giả lập. Không gọi model, không phân tích arbitrary project notes, không kết nối account nghiệp vụ, không gửi Telegram/Slack.

## Dependency và module boundaries

- `scripts/prepare_ba_runtime.py`: clone tạm ở `/tmp`, xác minh mỗi Git blob theo `contracts/ba-runtime.files.json`, export source vào `.local/agent-runtimes/ba/<commit>/source`, xóa checkout tạm và cài venv riêng theo upstream lock. Chỉ platform là Git checkout trong `/workspace`.
- `backend/ba_runtime.py`: kiểm tra nguyên file set và checksum mỗi lần dùng; phát hiện tamper hoặc runtime thiếu trả lỗi setup. Không tự fetch/download trong HTTP handler.
- `backend/ba_adapter.py`: chỉ gọi `--context --proposal --output`, không `--live`, không shell interpolation. Chặn output path/symlink không hợp lệ; file set cố định, file-size cap 4 MB; kiểm manifest/hash.
- `backend/ba_verify.py`: subprocess trong interpreter BA kiểm lại canonical input/bundle, domain và expected compiled bundle, audit input hash/fingerprints/run hash. Rehashed manifest không thể hợp thức hóa bundle hoặc audit bị sửa trong các tình huống đã kiểm thử.
- `backend/ba_jobs.py`: claim/lease persisted, release SQLite transaction trước khi gọi subprocess, import kết quả trong transaction. Worker loop dùng thread để không chặn event loop. SQLite chưa phải distributed queue; app chạy một worker process.
- `src/BaPanel.tsx`: UI riêng cho fixture/proposal, invocation/findings và canonical artifact. Mọi AC/RTM/UAT đều từ bundle, không tự tạo test giả để lấp coverage.

Nguồn agent không được copy thủ công vào source platform hoặc chỉnh sửa. Runtime dependency dùng Git authentication hiện có; đọc repo upstream là prerequisite lần cài đầu. Đây không phải fully sandboxed live-agent runtime; inherited proxy/auth/trust được giữ, supplied-proposal path không gọi provider hay tool.

## HTTP / persistence

`POST /api/projects/{pid}/runs` với `workflow="ba-harness-fixture"`, `proposal` optional JSON object. Không nhận `context`, principal/reviews/authority, command, output directory hoặc live model flag từ HTTP. Proposal tối đa 200 KB; trường thừa bị từ chối.

`GET /api/ba/fixture` cung cấp fixture synthetic cố định để operator chỉnh proposal. `GET /api/runs/{rid}/ba` cung cấp input snapshot và result; `GET /api/artifacts/{aid}/ba-pack[/<name>]` cung cấp pack gốc. Invocation và pack/download routes kiểm quyền project trước khi đọc. Fixture endpoint không chứa project/private data.

Hai bảng mới được tạo additive khi init, không reset DB:

| Bảng | Nội dung |
|---|---|
| ba_invocations | run ID, canonical context/proposal snapshot, input SHA, agent commit, state/result |
| ba_packs | artifact ID, nguyên văn 4 file UTF-8, full run hash |

Harness run có `runs.source_id=null` vì không sử dụng notes project. Lineage fixture nằm trong immutable invocation và bundle sources. File download trả đúng byte UTF-8 đã hash; review không ghi vào source/output file. Content artifact/raw pack không đổi khi business metadata thay đổi.

## State và limits

`queued/ba_run → running/ba_executing → awaiting_review` khi mọi check đạt. CLI exit 2 với `Escalated` → `escalated` và không có artifact, không coi là lỗi hạ tầng. Mapping AwaitingInput/AwaitingProposal được xử lý nhưng fixture context cố định không cung cấp interactive trust/authority editor để sửa các trạng thái này.

CLI timeout 15s; independent verify timeout 10s; lease 35s; một retry cho runtime AdapterError. Integrity error fail closed. Lease hết hạn sau restart được retry trong giới hạn. Không giữ SQLite write lock trong lúc chờ CLI. Review/approval vẫn chưa có real auth; actor là demo-pm.

`reviewed`: ghi review platform; canonical `ba_verification`, `business_validation`, baseline và UAT sign-off không đổi. `needs_changes`: chuyển `changes_requested`, giữ pack, operator chỉnh proposal để tạo run mới. Không sinh v2 giả từ feedback và không chuyển review này thành BA field confirmation.

## Lát cắt tiếp theo

Làm trusted-context workbench: nhập và version hóa nguồn/SOW, khai báo operator-controlled authority/data policy, validation preflight và rõ owner câu hỏi. Kết hợp authenticated project roles trước khi đưa dữ liệu thật vào. Sau đó mới cân nhắc model generation trong runtime có isolation/budget thực sự. Dynamic handoff, live connectors, arbitrary context auto-assembly và formal approval đều còn ngoài slice này.
