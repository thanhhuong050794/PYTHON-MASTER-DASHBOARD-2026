# NEU Admissions BI - Dashboard có đăng nhập & phân quyền theo đối tác

- **Backend:** Python · FastAPI · PyMongo (`backend/`)
- **Frontend:** React · TypeScript · Vite · ECharts (`frontend/`)
- **CSDL:** MongoDB (`MONGO_URI`, `MONGO_DB_NAME` trong `.env`)
- **Dữ liệu nguồn:** 6 file Excel trong `Data-20260929T164510Z-1-001/Data` (đã gitignore)

## Chạy nhanh

```bash
# 1. Backend
cp .env.example .env   # điền MONGO_URI, JWT_SECRET, SEED_*_PASSWORD
cd backend
uv sync
uv run python -m etl.seed            # đọc Excel → đối soát → ghi MongoDB + tạo đối tác & tài khoản
uv run uvicorn app.main:app --port 8000

# 2. Frontend (dev, proxy /api → :8000)
cd frontend
npm install
npm run dev                          # http://localhost:5173

# Hoặc build rồi để FastAPI phục vụ luôn giao diện ở http://localhost:8000
npm run build
```

Các tuỳ chọn nạp dữ liệu:

| Lệnh | Tác dụng |
|---|---|
| `uv run python -m etl.seed --dry-run` | Chỉ đọc Excel và in bảng đối soát, không ghi DB |
| `uv run python -m etl.seed --skip-data` | Chỉ tạo/cập nhật đối tác và tài khoản |
| `uv run python -m etl.seed --reset-passwords` | Đặt lại mật khẩu mặc định cho các tài khoản mặc định |

Muốn chạy với MongoDB khác mà không sửa `.env`: `MONGO_URI=mongodb://localhost:27017 uv run ...` (biến môi trường được ưu tiên hơn `.env`).

> **MongoDB Atlas:** cluster chỉ nhận kết nối từ IP có trong *Network Access*. Nếu gặp lỗi
> `SSL handshake failed … TLSV1_ALERT_INTERNAL_ERROR` thì cần thêm IP máy chạy vào allowlist, rồi chạy lại `etl.seed`.

## Tài khoản mặc định

Mật khẩu ban đầu lấy từ `SEED_ADMIN_PASSWORD` (admin) và `SEED_PARTNER_PASSWORD` (đối tác) trong `.env` — không ghi trong repo. **Đổi ngay sau lần đăng nhập đầu** (menu *Đổi mật khẩu*).

| Tài khoản | Đối tác | Mục được xem |
|---|---|---|
| `admin` | — (quản trị) | Tất cả + Quản trị & phân quyền |
| `dn` | DN · Doanh nghiệp | Tổng quan, Kết quả thi, Nhà tài trợ & truyền thông |
| `thpt` | THPT · Trường THPT | Tổng quan, CRM, Lead, Kết quả thi |
| `dh` | DH · Trường Đại học | Tổng quan, CRM, Lead, Kết quả thi |
| `info` | INFO · Đối tác trường | Tổng quan, CRM, Kênh & ROI, Lead, Kết quả thi |
| `metaads` | METAADS · Meta Ads | Tổng quan, CRM, Kênh & ROI, Lead, Kết quả thi |
| `miennam` | MIENNAM · Miền Nam | Tổng quan, CRM, Kênh & ROI, Lead, Kết quả thi |

Admin tạo thêm tài khoản (nhiều tài khoản cho 1 đối tác), khoá/mở khoá, đặt lại mật khẩu, bật/tắt mục dashboard và quyền xem thông tin cá nhân của từng đối tác trong trang **Quản trị & phân quyền**. Admin cũng có ô **Phạm vi dữ liệu** trên thanh trên cùng để xem dashboard đúng như một đối tác nhìn thấy.

## Phân quyền

Hai lớp, đều kiểm tra ở server (gọi API trực tiếp cũng không vượt được):

1. **Module** — mỗi đối tác có danh sách mục dashboard (`partners.modules`); API trả 403 nếu không có quyền.
2. **Dòng dữ liệu** — khi nạp Excel, mỗi document được gắn mảng `partners` (quy tắc ở `backend/etl/tagging.py`); mọi truy vấn của đối tác tự thêm điều kiện `{"partners": <mã>}`.

| Mã | Dữ liệu được xem |
|---|---|
| DN | Toàn bộ kết quả thi (nguồn nhân tài), quyền lợi nhà tài trợ, hiệu quả kênh truyền thông. Không xem CRM |
| THPT | Liên hệ/lead/điểm thi thuộc **Bảng A** (13–18 tuổi) |
| DH | Liên hệ/lead/điểm thi thuộc **Bảng B** (19–24 tuổi) |
| INFO | Liên hệ gán kênh **Đối tác trường** (UTM `partner=info`) + ngân sách/ROI kênh này |
| METAADS | Liên hệ kênh **Facebook** (UTM `partner=metaads` hoặc có FB Lead Form), toàn bộ lead FB, ngân sách/ROI Facebook |
| MIENNAM | Liên hệ có UTM `partner=miennam`, ở tỉnh/thành miền Nam hoặc thi tại điểm TP.HCM; điểm thi thí sinh miền Nam |

Thông tin cá nhân (email, SĐT) được che và CCCD/ngày sinh/ghi chú bị ẩn với tài khoản đối tác, trừ khi admin bật *Xem thông tin cá nhân*.

Bảo mật khác: mật khẩu băm bcrypt; phiên là JWT trong cookie `HttpOnly`/`SameSite=Lax` (đặt `COOKIE_SECURE=true` khi chạy HTTPS); khoá tạm 5 phút sau 5 lần đăng nhập sai; đổi/đặt lại mật khẩu hoặc khoá tài khoản sẽ vô hiệu mọi phiên cũ; nhật ký đăng nhập & thao tác quản trị lưu ở `audit_logs`.

## Dữ liệu trong MongoDB

| Collection | Nguồn | Số bản ghi |
|---|---|---|
| `raw_web_signups`, `raw_talkshow`, `raw_fb_leads` | Booklet 1 — dữ liệu thô giữ nguyên | 132 · 28 · 31 |
| `contacts` | Booklet 2 Master_Contacts + kênh attribution + điểm thi — hồ sơ vàng | 145 |
| `signups` | Main_Signups_Clean (gốc + chuẩn hoá, cờ Giữ/Trùng) | 132 |
| `leads` | External_Leads_Clean + nền tảng/campaign từ FB Form | 59 |
| `duplicate_log`, `data_quality` | Nhật ký gộp trùng, nhật ký chuẩn hoá | 46 · 200 |
| `channel_budgets` | Nguồn & ROI + CPA Analysis + Đối soát | 8 |
| `media_reach`, `sponsor_benefits` | Hiệu quả kênh, quyền lợi nhà tài trợ | 5 · 5 |
| `exam_candidates` | 3 bộ điểm giả lập: `PM119` (liên kết PT-xxx), `A24`, `B95` | 238 |
| `exam_scores` | Điểm từng phần thi (dạng dài, tiện cho BI) | 744 |
| `meta` | Segment/drip, cấu trúc đề & tham số, thống kê pipeline | 3 |
| `partners`, `users`, `audit_logs`, `import_runs` | Hệ thống | — |

Mỗi lần `etl.seed` chạy 38 phép đối soát với số liệu trên Dashboard Booklet 2 và báo cáo ROI (145 liên hệ, 119 đăng ký web, 66 thanh toán, 18,1 triệu doanh thu, số liệu từng kênh, 13 thí sinh chung kết…) và lưu kết quả vào `import_runs` (xem ở *Chất lượng dữ liệu → Lần nạp dữ liệu gần nhất*). Hai file điểm Bảng A/B chỉ chứa công thức chưa tính, nên tổng/hạng/xếp loại/chứng chỉ được tính lại theo đúng quy tắc sheet `Tham_so` và đối chiếu với file 119 thí sinh.

Lưu ý dữ liệu: số liệu Google/TikTok/Email/Zalo là **giả định** của báo cáo gốc; điểm thi là **giả lập**; 26 liên hệ và 30 lượt đăng ký web không có ngày trong dữ liệu gốc nên không xuất hiện trên biểu đồ theo thời gian (vẫn được tính trong tổng).
