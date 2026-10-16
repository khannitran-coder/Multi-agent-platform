# Khảo sát repository / environment

Kiểm tra ngày 16/10/2026 (giờ hiển thị UTC+7). Python 3.12.14, Node 24.19.0, npm 11.9.0, Chromium `/usr/bin/chromium`; không cần Docker/service ngoài. GitHub HTTPS read/clone qua authentication sẵn có đã thành công; không yêu cầu token mới và không đọc giá trị credential.

## Sáu checkout ban đầu

| Repo | Quan sát | Quyết định cho platform |
|---|---|---|
| Ba-Pm-agent | Python harness, JSON Schema 2020-12, domain gates, manifest/audit, fixture và CLI | Reference tích hợp chính, giữ read-only |
| AI-PM-Harness-starter | Anonymize/validate/benchmark 3 use cases; chưa có live adapter và benchmark thật | Tham khảo guardrail, không lấy làm web platform |
| Pm-agent-weekly-report | Project Python trong thư mục con; báo cáo tuần/harness | Candidate adapter tương lai, chưa chạy trong web |
| risk-monitoring-agent-2.0 | LangGraph, fake MCP clients, template drafter; connectors chưa triển khai | Candidate risk worker tương lai |
| sprint-risk-monitoring-agent | Risk quick-win LangGraph, trạng thái development | Reference lịch sử, không gộp thủ công core |
| PIMS-AI | Tài liệu P0/P1 Radar PMIS, chưa có app; AGENTS giới hạn fixture P1 riêng | Giữ nguyên nguồn/contracts, không dùng làm repo platform |

Đã đọc `/workspace/PIMS-AI/AGENTS.md`; phạm vi của nó thuộc Radar PMIS. Không có AGENTS ở workspace root hoặc BA checkout khi khảo sát. Repo platform cục bộ mới có AGENTS riêng ghi rõ synthetic-only, không external/live/deploy. Chỉ cài dependency cần cho platform và BA fixture validation; không chạy các connector/suite không thuộc workflow đã chọn.

## Phiên bản BA trên remote: cần phân biệt thời điểm

Lần đầu `git ls-remote origin HEAD refs/heads/main 'refs/tags/*'` trả `ae70a089da29fea5dcb4d935a283c8a6c1bff777`, khớp local checkout. Code `agent.py` khai báo `VERSION='0.2.0'`, schema `0.2`.

Lần kiểm tra tiếp theo trong cùng phiên, remote main đã chuyển sang **`9f786144e4a84361a373abacf45107c26c2c0262`**, commit `docs: add production agent flow diagrams`. Đã clone read-only source vào `.local/ba-remote` của platform để kiểm tra commit này, không reset/pull/sửa checkout BA ban đầu. Remote chỉ quảng bá HEAD/main tại lần kiểm tra; không có tag v0.2.1 được quảng bá.

Code mới vẫn `VERSION='0.2.0'`. `agent.py`, `contracts.py`, `domain.py` và cả ba canonical schema có byte content giống checkout ban đầu; README thêm liên kết tài liệu production flow. Vì vậy **chưa có bằng chứng v0.2.1 trên remote đã kiểm tra**. Không kết luận rằng workspace cũ của người dùng không có v0.2.1; workspace đó chưa có ở đây.

Contract integration đề xuất pin full commit `9f786144e4a84361a373abacf45107c26c2c0262`; giữ agent version 0.2.0. Trước integration thật phải xác minh lại remote và checksum, không tự nâng version theo tên release được nhắc trong chat.

| File trên commit remote đã đọc | SHA-256 |
|---|---|
| schemas/context.schema.json | `b34d16155b725d22810a5e74ea4988a618ff01f356a22bec85e0fb0b9fa2744c` |
| schemas/proposal.schema.json | `0d8597b1db9caec62200089cc18fe724ea5a471e942bdccbdb7e983d58240627` |
| schemas/bundle.schema.json | `ff126d6276f6147c577b267eb1683a3b6b561ae93b6250a4fa635e832a41533a` |

Git working status của sáu repo ban đầu sạch trước setup. Kiểm tra cuối phiên ghi trong VALIDATION.md. Dependency, Python env và demo outputs của BA được đặt ngoài checkout agent; `PYTHONDONTWRITEBYTECODE=1` tránh tạo pycache ở source.
