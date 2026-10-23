---
flow: portal
learnedCommit: 3ebed5507
learnedAt: 2026-10-22
tenant: shinhanbank (staging) — portal https://tuyendung-shinhanbank.stg.ehiring.com.vn
status: học từ code (chưa xem UI portal); CHƯA có flow/test
sources:
  - apps/portal/backend/src/talents/talents.{controller,service}.ts
  - apps/portal/backend/src/schedules/schedules.{controller,service}.ts
  - apps/portal/backend/src/talent-extra-info/*, talent-advanced-info/*, recruitments-plans/recruitments.service.ts
  - data/mongo/data/stg/shinhanbank/tenant-settings.yaml (EHIRING_PORTAL_URL)
---

# Portal ứng viên (công khai)

Cổng riêng cho **ứng viên bên ngoài** (không đăng nhập Keycloak): xem tin tuyển dụng, ứng tuyển, bổ sung thông tin, phản hồi lịch phỏng vấn. Mọi request ghi dữ liệu từ đây **tạo bản ghi thật và gửi mail tới email người ứng tuyển**.

## Phạm vi hiển thị

- Backend xác định **website** theo hostname request (`websites` có `domain`/`domains`); không khớp ⇒ `404 Website`.
- Chỉ liệt kê/chi tiết kế hoạch có `status = in-progress` **và** `websites` chứa website đó (`GET /portals/recruitments`, `/campaigns`, `/recruitments/:id/form-template`). Kế hoạch chưa publish (chưa gắn website) **không** lộ ra.

## Thao tác công khai

| Thao tác | API | Luật | Tác dụng phụ |
| --- | --- | --- | --- |
| Ứng tuyển vào kế hoạch | `POST /portals/talents/create` (có `recruitmentPlan`) | `basics` bắt buộc; kế hoạch phải tồn tại; kế hoạch `useDefaultPool` thì cần `website.defaultPool`; **luôn tạo talent MỚI** (không dò trùng email/điện thoại) rồi tạo application `in-progress` ở vòng 0 (không kiểm hồ sơ trùng); tên ghép từ họ/đệm/tên nếu thiếu `name` | Gắn nhiệm vụ checklist của kế hoạch (`lms`, `mof`…); phân tích CV nền (`parseCv`) nếu có file — toàn văn CV lưu `cv-texts` làm `cv_text` cho chấm điểm AI, nhãn AI (`aiLabels`) của lần parse mới **thay hẳn** nhãn cũ, lỗi cập nhật talent từ kết quả AI chỉ ghi log warn; **mail `CODE_TALENT_PORTAL` + `PORTAL_RECRUITMENT` cho ứng viên** (lỗi gửi bị nuốt) |
| Để lại thông tin (không ứng tuyển) | `POST /portals/talents/create` (không có kế hoạch) | Cần `website.defaultPool` | Tạo talent vào pool mặc định của website |
| Ứng tuyển theo chiến dịch | `POST /portals/talents/create-for-campaign` | — | Mail `PORTAL_CAMPAIGN` |
| Đăng ký / huỷ nhận mail tuyển dụng | `POST /portals/talents/subscribe-email-recruitment`, `.../unsubscribe-email-recruitment` | Tìm talent theo email; chưa có thì **tạo talent** (pool `send-email-recruitment`) và gắn tag `send-email-recruitment` | Talent có tag này **nhận mail tuyển dụng hàng loạt** từ `email-scheduler` |
| Điền thông tin bổ sung | `POST /portals/applications/:applicationId/talent-extra-info` | Cần **phiên OTP** (`OTP_SESSION_STRATEGY`) + giới hạn tốc độ + chống brute-force | Thông báo `TalentInfoUpdated` / sự kiện `application.extra-info-completed`; có thể tự qua vòng (`APPLICATION_NEXT_STEP_UPDATE_INFO=true`) |
| Thông tin nâng cao | `POST /portals/applications/:id/talent-advanced-info` | — | Mail `TALENT_INFO_UPDATED` |
| Xem lịch phỏng vấn | `GET /portals/schedules/:id` | Phiên OTP; **tối đa 3 request/phút**; lịch `canceled` ⇒ `404` | |
| Chấp nhận lịch | `PATCH /portals/schedules/:id/accept` | Phiên OTP, 3/phút | `scheduleResult = talent-accepted` (không đổi `status`) |
| Từ chối lịch | `PATCH /portals/schedules/:id/reject` `{note}` | Phiên OTP, 3/phút | `scheduleResult = talent-rejected`, **`status = canceled`**, mail `SCHEDULE_CANCEL_TALENT` + `SCHEDULE_CANCEL_USER` |

- Phiên OTP: ứng viên nhận mã qua mail (`CodeTalentPortal`, `VerificationCode` gửi lại theo yêu cầu) → đổi lấy phiên; endpoint nhạy cảm bị `ThrottlerGuard` + `BruteForceGuard`.
- Dữ liệu ứng viên (CV, ảnh) tải qua `file-manager` của portal (`/api/portals/file-manager/:id`).
- Domain portal và link công khai của tenant staging đã đổi sang `*.stg.talentx.vn` (`EHIRING_PUBLIC_URL`, `EHIRING_PORTAL_URL`, `EHIRING_EXTRA_INFO_URL`, `EHIRING_ONBOARDING_HANDBOOK_URL`, `EHIRING_DOMAINS` trong `tenant-settings.yaml`).

## Rủi ro cho kiểm thử

- Đây là cổng **công khai và ghi dữ liệu**: ứng tuyển bằng email thật ⇒ mail gửi người thật. Chỉ dùng email hộp thư QA; mỗi lần ứng tuyển **tạo thêm một talent mới** (không dọn được qua API — xem `talents.md`).
- Phiên OTP cần đọc mã từ hộp thư QA (`emails/v2` có nội dung mail → đọc được mã bằng API đọc; không cần mở hộp thư thật).
- Giới hạn 3 request/phút cho lịch: test chạy nhanh sẽ bị `429`.

## Điểm chưa chắc

- [ ] UI portal: trang chủ tuyển dụng, trang kế hoạch, form ứng tuyển (trường bắt buộc), trang OTP, trang bổ sung thông tin (`/extra-info/<code>`), trang lịch — **chưa xem** (domain `tuyendung-shinhanbank.stg.talentx.vn`) — nguồn đã xem: tenant-settings.yaml.
- [ ] Domain cũ `*.stg.ehiring.com.vn` còn phục vụ được không sau khi đổi sang `talentx.vn`? — nguồn đã xem: tenant-settings.yaml.
- [ ] Có bắt buộc CAPTCHA/OTP khi ứng tuyển không (code không thấy)?
- [ ] Ứng tuyển trùng email: tạo talent mới mỗi lần — nhưng `EHIRING_TALENT_IDS_VALIDATE` (email hoặc điện thoại) có chặn ở nơi khác (UI portal gọi validate)?
- [ ] Chiến dịch (`campaigns`): luồng riêng — chưa đọc.
- [ ] Bản `hurc` có xử lý riêng (`forHurc`), shinhanbank không dùng.

## Nghi bug

- 2026-10-11 · (code, chưa có spec) · `POST /portals/talents/create` kèm `recruitmentPlan` không dò talent trùng và không kiểm hồ sơ trùng: **cùng một email ứng tuyển hai lần ⇒ hai talent và hai application song song**, và vì `createByTalent` (luồng nội bộ) cấm một ứng viên có hai hồ sơ `in-progress`, hai luồng áp luật khác nhau.
- 2026-10-11 · (code, chưa có spec) · `rejectSchedule` (portal) đặt `status=canceled` và gửi mail huỷ cho người phỏng vấn mà **không kiểm lịch đã `done`/`canceled`** — ứng viên (có phiên OTP) từ chối lại một lịch đã hoàn tất vẫn đổi trạng thái về `canceled`, và gửi lại mail huỷ.

## Đã đổi theo commit mới

- 2026-10-22 · aa1fe551a → 3ebed5507 · `tenant-settings.yaml`: domain staging shinhanbank đổi từ `*.stg.ehiring.com.vn` sang `*.stg.talentx.vn` (portal, public, handbook, EHIRING_DOMAINS); đã sửa URL portal trong frontmatter và bảng thao tác.
- 2026-10-22 · aa1fe551a → 3ebed5507 · `talents.service.ts`: parse CV nền lưu toàn văn vào `cv-texts` (`cv_text`), nhãn AI (`aiLabels`) của lần parse mới thay hoàn toàn nhãn cũ; log lỗi AI có thêm `code`/`providerCode`. Đã bổ sung vào dòng «Ứng tuyển vào kế hoạch».