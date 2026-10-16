# Hướng dẫn dùng thử dành cho người non-tech

Ứng dụng hiện chạy trên máy có source code và công cụ phát triển. Xem GitHub chưa đồng nghĩa có website được host. Trong Codex cloud, có thể chạy/kiểm thử và xem ảnh bằng chứng; giao diện onboarding không có trình duyệt localhost tương tác.

## Trên máy cá nhân

1. Cài Git, Python 3.12+, Node.js 22+, npm và Bash từ nguồn chính thức. Trên Windows dùng Ubuntu qua WSL. Các kiểm thử dự án hiện chạy trên Linux.
2. Clone repo GitHub hoặc tải ZIP rồi giải nén. Mở Terminal trong thư mục có README và `scripts`. Installer cần Git read access tới repo BA nếu repo private; dùng quyền Git hiện có. Không dán token vào source hoặc chat.
3. Chạy `bash scripts/install.sh`. Đợi cài xong; làm lần đầu hoặc khi dependency thay đổi.
4. Chạy `bash scripts/start.sh`. Khi Uvicorn started và không có lỗi cổng, giữ terminal mở. Trên chính máy đang chạy, mở trình duyệt tới host loopback `127.0.0.1`, cổng `8000`. Không có URL public được tạo.
5. Dừng bằng Ctrl+C. Lần sau chỉ cần chạy lệnh start; tài liệu và lịch sử còn trong `.local`.

Nếu cổng 8000 bận, dùng `PORT=8002 bash scripts/start.sh`, rồi dùng cổng 8002. Nếu thiếu BA runtime, chạy lại install; không sửa checksum/source BA để bỏ qua lỗi. Upload/DB đều ignored; không xóa `.local` nếu cần giữ feedback.

## Thử một vòng làm việc

Tạo project với tên/mục tiêu → Tài liệu & Chạy BA → Dùng tài liệu mẫu giả lập → xác nhận dữ liệu mẫu → Chạy BA Agent · mẫu không tốn token → trả lời câu hỏi ở Workspace → mở Requirements draft → xem các tab → nhập nhận xét → Yêu cầu sửa bản nháp → review bản mới → Ghi nhận đã review.

Tải JSON bằng biểu tượng tải artifact. Xem input/hash/lịch sử ở Run & Handoff. Upload phiên bản mới vào đúng tài liệu cũ để kiểm tra job trước vẫn dùng v1. Link Drive riêng tư chỉ được lưu và báo chưa có quyền đọc; không yêu cầu mở quyền công khai.

TXT/Markdown cần UTF-8. PDF scan/ảnh sẽ báo cần bản có text; dùng DOCX/TXT hoặc PDF có thể chọn/copy chữ. Chưa OCR. Giới hạn 5 MiB/file, 100 trang PDF, 100 KB text trích xuất. Tài liệu lỗi bị từ chối; không tự cắt bớt text để giả vờ đọc đủ.

## Hiểu đúng kết quả

Luồng mẫu không dùng AI hiểu tài liệu, chỉ phù hợp góp ý UX. Kỹ thuật đạt chưa chứng minh nội dung đúng nghiệp vụ. Chờ PM review và Đã ghi nhận review đều chưa phê duyệt baseline/UAT.

BA v0.2.1 thật nằm ở luồng fixture hoặc chế độ nâng cao supplied-proposal. Nâng cao cần context/proposal canonical khớp nguồn; chưa có model tự tạo proposal từ file. Không cần model key để thử MVP, không phát sinh token model. Google Drive, Telegram, Jira và Confluence chưa kết nối tài khoản thật.
