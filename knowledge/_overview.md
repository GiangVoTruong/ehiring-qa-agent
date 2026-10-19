---
flow: overview
learnedCommit: aa1fe551a
learnedAt: 2026-10-11
status: bản đồ hệ thống — cập nhật dần khi học từng nhóm luồng
---

# Bản đồ eHiring (ATS đa tenant)

Hệ thống = 1 SPA Angular (`apps/ehiring-host`, ~35 lib giao diện ở `libs/ui/*`) + ~30 backend NestJS (`apps/<domain>/backend`) + 17 service nền (`apps/services/*`). Cổng web `shinhanbank.stg.ehiring.com.vn/api/<resource>` được proxy tới đúng backend.

## Chuỗi nghiệp vụ chính (tuyến tuyển dụng)

```
YCTD (yêu cầu tuyển dụng) ──duyệt──▶ Kế hoạch tuyển dụng (PATD) ──▶ Ứng viên vào kế hoạch (application)
   │                                      │ (các vòng: ScreenCV → Interview/Exam → TalentUpdating → Offer → ContractSigning → CheckList → Final)
   ▼                                      ▼
 email/thông báo duyệt              đăng tin ra site ngoài (integration) / portal tuyển dụng công khai
```

## Nhóm luồng & trạng thái học

| # | Nhóm | Knowledge | Mức học | Test |
| --- | --- | --- | --- | --- |
| 1 | Yêu cầu tuyển dụng (YCTD) | `recruitment-requests.md` | code + cấu hình + **UI kiểm chứng** | ✅ 6 test xanh |
| 2 | Kế hoạch tuyển dụng, job tự động | `recruitment-plans.md` | code + cấu hình + **UI kiểm chứng** | ✅ 1 test (8 bước) xanh |
| 3 | Hồ sơ ứng viên & chuyển vòng | `applications.md`, `ui-walkthrough-applications.md` | code + **thao tác thật** tới vòng phỏng vấn | ⬜ |
| 4 | Talent & talent pool | `talents.md` | code (chưa UI) | ⬜ |
| 5 | Phỏng vấn, lịch hẹn, phiếu đánh giá | `interviews.md` | code (chưa UI) | ⬜ |
| 6 | Offer, bổ sung thông tin, checklist, vòng cuối | `offers-and-onboarding.md` | code (chưa UI) | ⬜ |
| 7 | Portal ứng viên công khai | `portal.md`, `portal-ui.md` | code + **UI form ứng tuyển** (chỉ đọc) | ⬜ |
| 8 | Người dùng, nhóm, phân quyền | `users-and-permissions.md` | code (chưa UI) | ⬜ |
| 9 | Cấu hình tenant & chính sách thông báo | `tenant-config-and-notifications.md` | seed trong repo (cần xác nhận giá trị thật) | — |
| 10 | Danh mục, tích hợp ngoài, dịch vụ nền | `catalogs-integrations-services.md` | code + seed (chưa UI) | ⬜ |
| 10b | Giao diện: bản đồ trang + form tạo | `ui-map.md`, `ui-forms.md` | UI chỉ-đọc | — |
| 11 | Dashboard, thống kê, xuất file | (dưới) | nông | ⬜ |
| 12 | Thông báo trong app | (dưới) | nông | ⬜ |

### Dashboard & thông báo trong app (học nông)

- **Dashboard** (`apps/dashboard`, `dashboard-scheduler`): bảng số liệu tổng hợp theo lịch (seed `dashboard-schedules.yaml`: `recruitment_requests`, `recruitment_plans`, `users`, `talents`, `recruitment_request_managers`, `applications`, `offers`, `talent_extra_info`, `masterdata_ehiring`); route `dashboard`, `dashboard/:code`. Chỉ đọc số liệu; số liệu được tính nền nên **chậm so với dữ liệu thật**.
- **Thông báo trong app** (`apps/notifications`, chuông ở góc phải): `GET /notifications`; tài khoản QA đã có **hàng chục thông báo** từ các bản ghi `[AUTOTEST]`. Kênh `email` | `sms` | `push`, trạng thái `pending` → `created`. Chưa tìm thấy API xoá thông báo — chuông QA sẽ đầy dần.
- **Xuất file**: luôn qua `dynamicExport` (xem memory người dùng) — chưa học chi tiết.

## Giao diện

Xem `ui-map.md`: các route `/interviews`, `/offers`, `/final`, `/checklist`… **chỉ là màn cấu hình SLA**, không phải màn xử lý ứng viên; ứng viên được xử lý trong kanban của kế hoạch. Tài khoản QA không vào được `/user-groups`.

## Đã phát hiện: nghi bug theo họ (tất cả ở mức API/cấu hình, đã ghi trong từng knowledge)

1. **Không kiểm trạng thái nguồn** khi đổi trạng thái: YCTD huỷ vẫn duyệt, kế hoạch đổi status thẳng, hồ sơ `rejected` vẫn chuyển vòng, offer `rejected` vẫn duyệt, lịch `done` vẫn bị ứng viên từ chối.
2. **Chỉ UI chặn** điều kiện (chọn YCTD Open, menu trạng thái theo vòng).
3. **Xoá không đối xứng**: không xoá được talent (chỉ gỡ khỏi pool), không có DELETE mail, JD/website đang dùng vẫn xoá được (nghi), job tự xoá cứng hồ sơ chờ bổ sung.
4. **Số liệu lệch**: `total` của pool, `quantity_` không ai đọc (Expected Quantity luôn 1), kế hoạch tự bắt đầu/kết thúc theo ngày **UTC** (lệch 1 ngày với giờ VN).

## Bất biến xuyên suốt (đã kiểm chứng)

- Mọi bản ghi test đặt tên `[AUTOTEST]`; người liên quan = tài khoản QA (`dev_shinhanbank`, System Admin, hộp thư `dev_shinhanbank@shinhanbank.com`).
- UI dynamic form (YCTD, kế hoạch…): cấu hình ở `dynamic-forms.yaml` (bản VI + bản EN), DOM không có `name`; chọn user phải gõ từng ký tự.
- Trạng thái nguồn thường **chỉ UI chặn**, backend không kiểm → đa số "nghi bug" ở mức API.
- Xoá: UI hiếm có nút xoá; backend `softDelete: true` (DELETE đặt `__isDeleted`), riêng `emails/v2` không có DELETE.
- Mail: handler ở `libs/smc/email-template/.../email-type/*`, cần template `private:true` của tenant trong `mail-templates`; seed shinhanbank thiếu nhiều template ⇒ nhiều mail có thể không gửi (lỗi bị nuốt).
