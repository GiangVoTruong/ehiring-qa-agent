---
flow: catalogs-integrations-services
learnedCommit: aa1fe551a
learnedAt: 2026-10-11
tenant: shinhanbank (staging)
status: học từ code + seed (chưa xem UI); CHƯA có flow/test
sources:
  - apps/competencies/backend/src/app/{competencies,competency-groups}/*, apps/job-descriptions, apps/websites
  - apps/integration/backend/src/*, data/mongo/data/stg/shinhanbank/{integration-templates,integrations}.yaml
  - apps/services/{job-scheduler,email-scheduler,integration-scheduler,receive-email,dashboard-scheduler,mailer,...}
---

# Danh mục, tích hợp ngoài, dịch vụ nền

## 1. Danh mục dùng chung (trang Customizations / Competency)

| Danh mục | Route API | Quy tắc đã biết |
| --- | --- | --- |
| **Competency** (tiêu chí đánh giá) | `competencies` | Bắt buộc `name`, `type ∈ {Skill, Attitude, Knowledge}`; có câu hỏi + cấp độ. **Không xoá được tiêu chí đang dùng trong một nhóm** (`Không thể xoá vì tiêu chí đang được sử dụng!` — tìm trong `competencyTeam.competencyContent.competencies` của tenant) |
| **Competency group** (bộ tiêu chí) | `competency-groups` | Bắt buộc `code`, `name`; `code` **tự sinh 8 ký tự** nếu không gửi khi sửa/thay thế. Cấu trúc `competencyTeam[] → competencyContent[] → competencies` kèm `expectedPoint`/`point`. Gắn vào kế hoạch ở bước "Competency Groups" (`competencyGroupRef`) |
| **Job description** | `job-descriptions` | Bắt buộc `title`; nội dung theo `sections[]` (Mô tả công việc / Yêu cầu / Quyền lợi). Kế hoạch **bắt buộc chọn JD** |
| **Website** | `websites` (+ `masterdata/manage/websites`) | Cấu hình site tuyển dụng công khai: domain(s), banner, cấu trúc trang, `defaultPool`. Danh sách kèm `talentCount`, `planCount`. Portal chọn website theo hostname; kế hoạch hiện ở portal khi `websites` chứa website đó |
| **Mail template** | `mail-templates` | Mẫu mail theo tenant (`code`, `private`); seed shinhanbank chỉ có ~10 mẫu (xem `tenant-config-and-notifications.md`) |
| **Form template / dynamic form / forms-fields** | `form-templates`, `dynamic-forms`, `masterdata/manage/forms-fields` | Cấu hình form động (YCTD, kế hoạch, talent portal…); đã dùng làm nguồn trường bắt buộc |
| **Masterdata** | `masterdata`, `masterdata/manage/*` | Danh mục dùng ở ô chọn (phòng họp, địa điểm phỏng vấn, nơi làm việc, trình độ, ngân hàng…) |
| **Configuration** | `configuration`, `masterdata/manage/configurations` | Cấu hình JSONata (mã YCTD, form offer, vòng mặc định…) |

Điểm chung: CRUD khai báo (`@peoplex/crud`), xoá mềm, giới hạn `tenant`; thấy bản ghi của tenant mình **hoặc** bản không có `tenant` (dùng chung toàn hệ thống).

## 2. Tích hợp ngoài (`apps/integration`, `external-interaction`, `webhook`)

- **Mẫu tích hợp** (`integration-templates`, cấu hình trong DB, gọi qua `POST /integration-templates/:code`): shinhanbank có `boundary` (định biên — **đã dùng khi tạo YCTD**, trả `lsLevel1..5Code`, `t<tháng>`, `aM<tháng>`), `VNW_*` (**VietnamWorks**: lấy refresh token, đồng bộ hồ sơ/trạng thái), `BASE_*` (Base Hiring: đồng bộ ứng viên, pool, kế hoạch).
- **Tiến trình tích hợp** (`integrations`): `IntegrationStatusEnum`: `pending` → `in_progress` → `passed` | `failed` | `error` | `sent`. `integration-scheduler` quét và chạy (có runner riêng cho **gửi offer** `APP_OFFER_SENDER_*`, **masterdata** `APP_MASTERDATA_SENDER_*`, **đồng bộ talent** `EHIRING_SYNC_TALENT_*`, **webhook** `APP_WEBHOOK_SYNCHRONIZE_*`).
- `integration/*` là cổng **nhận** dữ liệu từ hệ thống ngoài: `integration/recruitments`, `integration/applications`, `integration/offers` (+ `multiple-offers`), `integration/users` (đồng bộ người dùng từ HRIS), `integrations/voffice` (ký/duyệt điện tử).
- **iHRP** (hệ thống nhân sự) đang **tắt** trên staging (`EHIRING_INTEGRATION_IHRP_*` bị comment trong `tenant-settings.yaml`); Talent Network (`api.talentnetwork.vn`) cấu hình có khoá (không ghi lại ở đây).
- Tạo YCTD với `approvedType='online'` chạy tích hợp `recruitment-request` — seed shinhanbank **không có** template này (xem `recruitment-requests.md`). Tạo offer chạy tích hợp offer (`handleOfferIntegration`).
- Đóng kế hoạch gỡ tin ngoài qua `RecruitmentPlanCloseService` → `POST {integration.internal_url}/integration-templates/:code` (VNW). Kế hoạch test **không có tin ngoài** nên bước này không có tác dụng.

## 3. Dịch vụ nền (`apps/services/*`) — không có giao diện

| Dịch vụ | Việc làm | Bật bằng | Ghi chú rủi ro |
| --- | --- | --- | --- |
| `job-scheduler` | **recruitmentPlanRunner**: tự **bắt đầu** kế hoạch `is-scheduled` có `startDate` hôm nay (UTC), tự **đóng** kế hoạch `in-progress`/`pending` có `endDate` ≤ hôm nay (UTC). **removeApplicationRunner**: **xoá cứng** mọi hồ sơ `pending-update-info` tạo hơn 1 ngày. **scheduleRunner**, **checkListRunner** (chạy lại checklist API lỗi), **webhookRunner** | `APP_<X>_RUNNER_ENABLED` / `_INTERVAL` | `APP_SCHEDULE_RUNNER_ENABLED='false'` ở seed staging → cron lịch có thể tắt |
| `email-scheduler` | Gửi mail định kỳ: `send-email-birthday-talent`, `send-email-new-year-talent` (**tới mọi talent có tag `send-email-recruitment`**) | `APP_EMAIL_SENDER_INTERVAL` | ⚠️ chỉ talent tự đăng ký nhận mail |
| `mailer` | Gửi mail thật (SMTP) từ hàng đợi; có `MAILER_ROUTING_ENABLED` | — | Cổng ra duy nhất của mọi mail |
| `receive-email` | Nhận mail đến (vd phản hồi) theo `APP_RECEIVE_EMAIL_RUNNER_INTERVAL` | | |
| `integration-scheduler` / `integration-sender` / `integration-adapter` | Chạy tích hợp: gửi offer, đồng bộ masterdata/talent/webhook | xem trên | Gọi ra ngoài |
| `notifications` | Xử lý sự kiện thông báo → mail + trong app theo `NOTIFICATION_POLICY` | | |
| `dashboard-scheduler`, `metrics`, `export` | Số liệu dashboard, xuất file (`dynamicExport`), metrics | | |
| `cv-parser`, `ai-cv-parser`, `smc-cv-parser`, `embedding`, `gpt`, `azure-gpt` | Phân tích CV, embedding, GPT | | Gọi dịch vụ AI ngoài — có thể tốn phí |

## Điểm chưa chắc

- [ ] UI các trang danh mục: `/competencies`, `/competency-groups`, `/job-descriptions`, `/website-configurations`, `/masterdata`, `/email-templates`, `/portal-configs` — chưa xem.
- [ ] Runner nào đang bật trên staging (env `APP_*_ENABLED` không có trong repo) — quyết định liệu test "kế hoạch tự bắt đầu/đóng theo ngày" có chạy được.
- [ ] `removeApplicationRunner`: hồ sơ `pending-update-info` (tạo bởi `createByTalent`, chờ ứng viên điền) bị **xoá cứng** sau 1 ngày — nếu job bật; ảnh hưởng thế nào đến talent đã tạo, mail đã gửi.
- [ ] Danh mục competency/JD/website: trường bắt buộc & ràng buộc xoá của JD và website (JD đang dùng trong kế hoạch có xoá được không? — code `job-descriptions.service` chỉ 17 dòng, không kiểm).
- [ ] `mailer`: nơi mail thực sự ra ngoài; staging dùng SMTP thật hay bắt mail (mailhog)? — **quyết định rủi ro mail**.

## Nghi bug

- 2026-10-11 · (code, chưa có spec) · Xoá **job description** / **website** đang được kế hoạch tham chiếu không bị chặn (khác competency có chặn "đang được sử dụng"): `job-descriptions.service` không kiểm tham chiếu; `websites` chưa thấy kiểm `planCount`. Cần kiểm trên UI.
- 2026-10-11 · (code, chưa có spec) · `removeUnusedApplication` dùng `deleteOne` (xoá cứng, không soft-delete như phần còn lại) và không xoá các tài liệu liên quan (checklist, extra-info, talent) ⇒ rác mồ côi.
