# Kiểm chứng BA harness fixture integration — 16/10/2026

Bản hiện tại đã nối web với BA CLI thật ở chế độ supplied-proposal trên fixture công nợ. Chỉ kiểm chứng kỹ thuật; chưa phải business UAT hoặc formal approval.

| Kiểm tra | Kết quả |
|---|---|
| `python3 scripts/prepare_ba_runtime.py` | PASS: tải Git pin commit, kiểm 63 file, venv/lock và pip check; không thêm Git checkout |
| `bash scripts/install.sh` | PASS: cài platform + BA runtime, npm ci và build; cache đã cài được kiểm lại khi chạy lặp |
| `.venv/bin/python -m pytest tests/test_api.py tests/test_ba_integration.py -q` | **19 passed**, 0 failed/skipped/xfail; một Starlette/AnyIO deprecation warning |
| `npm run build` | PASS: TypeScript và Vite |
| `npm run test:e2e` | **5 passed**, Chromium desktop/mobile |
| Server thật qua `scripts/start.sh` | PASS: health mode prototype, runtime ready, project/run fixture → awaiting_review, manifest download đúng hash |
| Workspace discovery | Chỉ một project checkout `/workspace/pm-agent-platform`; source BA là dependency cache không có `.git` |

Backend tests chạy CLI thật: import đủ 2 requirements, 1 story, cả happy/edge/error và 3 UAT test plans; story vẫn Blocked khi thiếu confirmation. Kiểm tra source giả → Escalated/không artifact; input context/authority ngoài schema bị từ chối; proposal size bound; project membership; review không tạo BA confirmations; needs_changes không tự rewrite pack; replay; tamper hash/file và rehashed bundle/audit; path/symlink escape; runtime source sửa byte; timeout/retry exhaustion. Không dùng passing pack giả để thay harness.

Browser journey mới: tạo project → workflow BA fixture → mở canonical artifact → xem đủ AC/RTM → tải manifest → record review nhưng approval vẫn chưa có → request changes giữ một phiên bản. Negative journey sửa evidence source trong JSON và nhận `REQ-01: unknown source`, không có artifact. Mobile BA workflow/editor/artifact/download không overflow ở 390×844. Hai hành trình prototype cũ vẫn pass.

Kết quả và ảnh: `.local/evidence/browser-results.json`, `08-ba-harness-review.png`, `09-ba-gate-rejection.png`, `10-ba-mobile.png`, `ba-live-smoke.json`. Log install: `.local/ba-integration-install.log`. Main instance có project synthetic **BA Harness · Công nợ (fixture)** để tiếp tục review; không thay dự án đã có. Bộ test dùng DB tách riêng.

Chưa triển khai: phân tích notes tùy ý bằng BA/model, trusted-context editor với real identity/authority, claim-level confirmation, dynamic handoff dispatch, live model/token budget, channel identity/delivery, production/deploy và formal approval. Nội dung fixture không phải bằng chứng model quality. Readonly source/hash checks không phải enforced sandbox hoặc signed audit.

---

## Baseline prototype trước khi nối harness (lưu vết)

Các trạng thái “chưa nối BA” bên dưới mô tả baseline cũ; trạng thái hiện tại ở bảng trên.

# Kiểm chứng prototype — 16/10/2026

Kết quả dưới đây là kiểm tra kỹ thuật trên cloud instance hiện tại, không phải PM UAT, nghiệm thu nghiệp vụ hay production approval.

## Kết quả

| Kiểm tra | Kết quả thực tế |
|---|---|
| `bash scripts/install.sh` | PASS: pip pinned lock, npm ci frozen lock, TypeScript/Vite build |
| `bash scripts/start.sh` | PASS: build UI và khởi động Uvicorn loopback cổng 8000 |
| Local functional HTTP | PASS: `/api/health` báo SQLite + simulation; `/`, JS và CSS đúng content type/HTTP 200 |
| `.venv/bin/python -m pytest tests/test_api.py -q` | **8 passed**, không skipped/xfail; một DeprecationWarning của Starlette/AnyIO |
| `npm run test:e2e` | **2 passed** trên Chromium, bản cuối; không có browser page error trong full journey |
| BA unittest trên checkout ban đầu | **54 tests, OK**, fixture-only |
| BA unittest trên clone remote `9f786144…` | **54 tests, OK**, fixture-only |
| BA `agent.py --demo` trên hai checkout | PASS: AwaitingPMReview, agent_version=0.2.0, không live model |
| SHA-256 manifest của cả hai BA demo pack | PASS: từng file khớp manifest; baseline/uat_signoff vẫn Not Approved |
| Invocation schema 2020-12 và example | PASS; schema hợp lệ, example được chấp nhận; model live, version 0.2.1 và command ngoài schema bị từ chối |
| Git working status 6 repo gốc | CLEAN trước và sau; không sửa source, schema hoặc lockfile của agent |
| `install_script` / `start_skill` environment draft | Đã lưu thành công; chưa publish; không tự thực thi hoặc triển khai từ thao tác save |

## Hành trình browser đã chạy

Desktop 1440×1080: tạo project từ notes mẫu → khởi chạy Requirements Discovery → nhận Q-01 → trả lời → chờ artifact v1 → reload để xác nhận conversation/artifact còn → mở review pack → yêu cầu sửa → nhận v2 → chọn v1 và xác nhận không được review thay v2 → quay v2 và ghi nhận review → kiểm tra approval vẫn chưa có → xem RTM/UAT plan → xem handoff event → xem snapshot nội bộ → lưu Telegram preferences → reload xác nhận preferences còn → mở registry/filter → quay lại deep link workspace đúng project/run.

Mobile 390×844: điều hướng Workspace, chuyển sang project seed khác, xác nhận không thấy artifact của project trước, kiểm tra không có horizontal overflow. Đây là layout smoke test; chưa phải accessibility audit hoặc full browser matrix.

Lần browser đầu tiên có một failure tại locator `handoff.ba_qa` vì text event và actor ở chung node. Đã tách nhãn event, sửa locator cho hai event thuộc hai version, chạy lại toàn hành trình và PASS. Không bỏ hoặc giảm assertion về handoff. Các lỗi setup đã xử lý: npm cache mặc định ở home không ghi được → chuyển cache sang `.local/npm-cache`; server khởi động trước build → static mount hỗ trợ thư mục build chưa tồn tại, script startup luôn build trước.

## API scenarios đã chạy

- Full journey, version/hash cũ bất biến, business review không đổi approval/UAT.
- Membership gate chặn project/run/review/channel không được cấp quyền; project khác không thấy conversation/artifact.
- Source version khóa ở thời điểm chạy; input mới không làm đổi run cũ; duplicate run/answer bị 409.
- Vượt 3 revision bị từ chối; stale version review bị từ chối.
- SQLite reinitialization giữ dữ liệu, channel không tạo credential; invalid input và cross-origin mutation bị chặn.
- Worker deadline/retry phục hồi và retry exhaustion fail closed, không publish partial draft.
- BA standalone không handoff QA/Snapshot sau draft; chỉ có schema check nội bộ và blocker snapshot trước đó.

## Artifact bằng chứng

`.local/evidence/browser-results.json` là report của lần browser cuối; screenshot gồm:

1. `01-overview.png`
2. `02-clarification.png`
3. `03-review.png`
4. `04-run.png`
5. `05-channels.png`
6. `06-registry.png`
7. `07-mobile.png`

DB browser tách riêng theo timestamp; không thay dữ liệu server chính. Demo packs BA nằm `.local/ba-smoke/` và `.local/ba-smoke-remote/`, ngoài các checkout gốc. Cài BA dependency trong `.local/ba-venv`, dùng `PYTHONDONTWRITEBYTECODE=1` với source. Lệnh chạy không dùng `--live`, không gửi Telegram/Slack hoặc tạo account.

## Chưa làm / chưa xác nhận

BA-to-web real adapter, trusted context assembly, field-level BA confirmations, provider/model quality, chi phí live, real multi-user auth/RBAC, channel identity/webhook/scheduler/delivery, PDF/DOCX upload, hardening/concurrency/load tests, business UAT, deployment và fresh cloud task restoration đều chưa triển khai hoặc chưa kiểm chứng. Prototype có giới hạn cố ý được ghi tại README/ARCHITECTURE. Không coi schema prototype pass là BA domain pass.

Platform dùng remote `https://github.com/khannitran-coder/Multi-agent-platform.git`, nhánh `main`. Fresh cloud task restoration vẫn chưa được kiểm chứng. Publish cấu hình môi trường là thao tác của người dùng, không phải deploy sản phẩm.


## Chuẩn bị GitHub remote do người dùng cung cấp

Người dùng chọn `khannitran-coder/Multi-agent-platform`. Đã xác minh Git read thành công, remote ban đầu chưa quảng bá ref, API cho biết `private=false` và tài khoản có `permissions.push=true`. Yêu cầu chuyển repo sang private qua API từng bị từ chối với HTTP 403 `Resource not accessible by integration`. Sau đó người dùng xác nhận cho phép push vào repo public, đổi private sau. Origin local trỏ tới repo này; không tiếp tục yêu cầu đổi visibility. Kết quả push cần đối chiếu full SHA giữa local HEAD và remote `refs/heads/main`.
