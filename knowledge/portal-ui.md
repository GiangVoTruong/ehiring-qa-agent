---
flow: portal-ui
learnedCommit: aa1fe551a
learnedAt: 2026-10-11
tenant: shinhanbank (staging) — portal https://tuyendung-shinhanbank.stg.ehiring.com.vn (giao diện TIẾNG VIỆT)
status: đọc từ giao diện, phiên ẩn danh (như ứng viên ngoài), CHỈ ĐỌC — mọi request ghi bị chặn; chưa nộp hồ sơ nào
---

# Portal ứng viên: các trang và form ứng tuyển

## Trang

| Trang | URL | Nội dung |
| --- | --- | --- |
| Trang chủ | `/home` | Menu: **Trang chủ · Giới thiệu · Quyền lợi · Tin tức · FAQs · Liên hệ** (các mục là neo `/home#introduction`, `#benefits`, `#articles`, `#faq`, `#footer`) + nút **TUYỂN DỤNG**. Nội dung giới thiệu hiện là bản mẫu của HSC (chưa thay bằng Shinhan Bank) |
| Danh sách việc | `/recruitments` | "CƠ HỘI NGHỀ NGHIỆP"; bộ lọc **Tên vị trí · Ngành nghề · Khu vực**; mỗi tin có nút **CHI TIẾT**; chân trang: trụ sở, chi nhánh Hà Nội, liên hệ `recruitment@hsc.com.vn` |
| Chi tiết việc | `/recruitments/:planId?type_child=type4` | "VỊ TRÍ TUYỂN DỤNG": **Mô tả công việc · Yêu cầu · Quyền lợi · Thông tin chung** (Salary, Location, Expiration date, Updated at) + nút **ỨNG TUYỂN NGAY** |

- Dữ liệu từ `GET /api/portals/recruitments` (chỉ kế hoạch `in-progress` đã gắn website), `/api/portals/masterdata/{business-line,area,work-places,plan-cascader,recruitment-plan-tags}/data` cho các bộ lọc, `/api/portals/layouts` cho giao diện.
- **Đang chỉ đăng 1 tin: "2026 SHINHAN BANK"** (`6aace67a652d29de75600c51`, của team, hạn "không giới hạn", cập nhật 21/9/2026, địa điểm HCM) — **kế hoạch QA chưa được đăng** (chưa gắn website) nên không hiện ở portal.
- Một số ảnh/biểu tượng portal trả **401** (`/api/portals/file-manager/<id>`): ảnh banner thiếu quyền — lỗi hiển thị (`banner-image` vỡ).

## Form ứng tuyển — modal "Ứng tuyển vị trí <tên tin>" (bấm ỨNG TUYỂN NGAY)

Mục **"Thông tin cá nhân / Employee Information"**. Xây bằng Mantine (nút `formDynamicSubmitButton`).

| # | Trường | Kiểu | Bắt buộc | Ràng buộc đã thấy |
| --- | --- | --- | --- | --- |
| 1 | Họ và tên ứng viên / Full Name | text (`Nhập họ và tên ứng viên`) | ✅ | |
| 2 | Giới tính | radio **Nam / Nữ** | ✅ | |
| 3 | Ngày tháng năm sinh | text (`DD/MM/YYYY`) | ✅ | không hiện lỗi khi nhập `99/99/9999` (nhập tay, không bộ chọn) |
| 4 | Điện thoại di động / Phone Number | `tel` (`Nhập số điện thoại`) | ✅ | **ô tự lọc ký tự không phải số** (gõ `abc` → rỗng) |
| 5 | Email | `email` (`Nhập email`) | ✅ | |
| 6 | Giới thiệu bản thân | textarea (`Nhập giới thiệu`) | ✅ | |
| 7 | Tải lên CV | file (**PDF / JPG / PNG**, "Click để chọn và tải lên CV của bạn") | ✅ | |
| 8 | **Cam kết thông tin ứng viên / Policy Agreement**: ô **"Đồng ý / Agree Consent Form"** | checkbox | ✅ | kèm câu *"Vui lòng xem hết Consent Form trên để thực hiện đánh checkbox"* (phải **cuộn hết** Consent Form mới tích được) |
| — | Nút **Ứng tuyển** | | | **bị khoá (disabled) cho tới khi mọi trường bắt buộc hợp lệ + consent** — nên bấm khi form trống **không báo lỗi gì** |

- Không hiện thông báo lỗi dưới ô khi nhập sai (email `khong-phai-email`, ngày `99/99/9999`): form chỉ giữ nút khoá.

## Sau khi nộp (từ code, `portal.md`)

`POST /api/portals/talents/create` → **luôn tạo talent MỚI + hồ sơ `in-progress` vòng đầu** (không kiểm trùng); mail `CODE_TALENT_PORTAL` (mã OTP) + `PORTAL_RECRUITMENT` cho ứng viên; CV phân tích nền. Ứng viên dùng mã OTP để vào các trang bổ sung thông tin / phản hồi lịch.

## Để kiểm thử portal an toàn

- **Không nộp vào tin "2026 SHINHAN BANK"** (của team — sẽ tạo hồ sơ thật trong kế hoạch của họ và gửi mail).
- Cần **đăng kế hoạch QA lên portal** (gắn website, qua tab "Job posting" của kế hoạch; `RECRUITMENT_PLAN_PUBLISH_WORK_NETWORK` đang bật, chỉ nhóm SYS_ADM/RECRUITMENT_ADM/RECRUITER được đăng) — **chưa khám phá**; đăng tin sẽ gọi tích hợp ngoài (VietnamWorks) nếu bật mạng việc làm.
- Email ứng viên = hộp thư QA; talent tạo ra không xoá được; mỗi lần nộp tạo thêm một talent.

## Điểm chưa chắc

- [ ] Tab "Job posting" của kế hoạch: gắn website thế nào, có gọi VietnamWorks không.
- [ ] Nội dung Consent Form (độ dài, cách cuộn) và link tải "điều khoản bảo vệ ứng viên".
- [ ] Trang OTP ("nhập mã") sau khi nộp; trang bổ sung thông tin `/extra-info/<mã>`; trang phản hồi lịch phỏng vấn.
- [ ] Kiểm tra email/điện thoại trùng ở phía portal (giao diện không báo).
