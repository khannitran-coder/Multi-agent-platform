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

Platform là repo cục bộ mới chưa có remote; không sửa membership 6 repository trong cấu hình. Draft đã lưu hướng dẫn cho source hiện có, chưa chứng minh có thể tái tạo source repo mới chỉ từ Git. Khi cần dùng lâu dài, chọn remote riêng và kiểm chứng snapshot/khôi phục trong bước sau. Publish cấu hình môi trường là thao tác của người dùng, không phải deploy sản phẩm.
