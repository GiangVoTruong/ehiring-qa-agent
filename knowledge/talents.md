---
flow: talents
learnedCommit: 3ebed5507
learnedAt: 2026-10-22
tenant: shinhanbank (staging)
status: học từ code (chưa xem UI); CHƯA có flow/test
sources:
  - apps/talent-pools/backend/src/talents/talents.{service,controller}.ts
  - apps/talent-pools/backend/src/talent-pools/talent-pools.{service,controller}.ts
  - libs/models/src/{talent,talent-pool}/*
  - apps/recruitment/backend/src/app/applications/applications.service.ts (createByTalent, reject → pool)
---

# Talent (ứng viên trong kho) và Talent Pool

**Talent** = hồ sơ một người trong kho nhân tài (độc lập với kế hoạch). **Talent pool** = nhóm talent. Application (xem `applications.md`) liên kết talent với một kế hoạch.

## Mô hình & quy tắc

- Talent: `basics` (`name`, `email`, `phone`, `dob`, `image`…), `pools[]` (**bắt buộc ≥ 1 pool**), `ids[]` (kiểu `code` sinh từ id), `tags`, `isPublic`, `meta.source` (`portal` | `external`). Tên được chuẩn hoá (`formatName`) và tách `firstName`/`lastName`.
- Talent có `aiLabels` (6 nhóm nhãn AI từ `/v1/cv/labels`, mỗi nhãn kèm độ tin cậy). Tách khỏi `tags` vì `tags` đang chứa tag copy từ pool và nằm trong text index. (`libs/models/src/talent/talent.schema.ts`)
- Pool: `name`, `description`, `total` (số talent, đếm tay `+1/-1`), `tags`, `isPublic`, `isDefault`. **Pool mặc định** (`TalentPoolDefault`): `keep-in-view`, `black-list`, `reject`, `pending-pool`.
- Talent **tìm trùng theo `basics.email`** (cả `createByTalent`); `POST /talents/validate {email,phone,ids}` trả `{email:bool, phone:bool, …}` (chỉ báo, không chặn). Không có unique index → tạo trùng email được qua `POST /talents`.
- Tạo talent **không gửi mail**. Gắn tag từ pool (`cloneTagFromPool`): talent thừa kế `tags` của các pool.

## Thao tác (API)

| Thao tác | API | Luật | Ghi chú |
| --- | --- | --- | --- |
| Thêm talent vào pool | `POST /talent-pools/:poolId/talents` (hoặc `POST /talents/create` nhiều pool) | — | Tạo talent mới với `pools` đã gán; chuẩn hoá tên |
| Sửa talent | `PATCH /talent-pools/:poolId/talents/:id` | — | |
| Chia sẻ sang pool khác | `PATCH /talents/:id/share` `{pools,isKeep}` · `PATCH /talents/share-talents` `{talentIds,pools,isKeep}` | `isKeep=false` = **chuyển** (rút khỏi pool hiện tại); sau chuyển phải còn ≥1 pool (`Talent must be in at least one pool`) | Cập nhật `total` pool và tags |
| **"Xoá" talent** | `DELETE /talent-pools/:poolId/talents/:id` | **Chỉ gỡ talent khỏi pool đó**, và từ chối nếu là pool cuối (`Talent must be in at least one pool`) | ⚠️ **API không xoá hẳn được talent** → talent test (`[AUTOTEST]`) **không dọn được** bằng API; chỉ gỡ khỏi pool phụ |
| Sửa pool | `PATCH /talent-pools/:id` | Không đổi được `isDefault` từ true→false (`Cannot change default talent pool`); đổi `tags`/`isPublic` của pool **cập nhật mọi talent** trong pool | |
| Xoá pool | `DELETE /talent-pools/:id` | Pool mặc định không xoá được (`Cannot delete default talent pool`); với `softDelete:false` rút pool khỏi mọi talent | |
| Phân tích CV | `POST /talents/parse-cv {files}` | Dùng nhà cung cấp theo tenant (AI extract hoặc parser). Toàn văn CV lưu collection `cv-texts` (làm `cv_text` cho chấm điểm AI), **không** trả FE; response chỉ có talent đã gộp + `aiLabels` (nếu có), không bao giờ có `rawText`. Lỗi: `QUOTA_EXCEEDED` / `RATE_LIMITED` → **429**; mọi mã khác (kể cả `PLAN_UNAVAILABLE`) → **400**; body `{code, message, providerCode?}`. FE phân biệt bằng `code`. Không dùng 403 vì FE interceptor chuyển 403 sang `/unauthorized` | Gọi dịch vụ ngoài; có thể tốn phí |
| Embedding | `PATCH /talents/:id/embedding` | — | Gọi dịch vụ AI |

## Liên hệ với luồng ứng viên

- Reject hồ sơ với lý do `KEEP_IN_VIEW` / `BLACKLIST` / `DISQUALIFIED` ⇒ talent **chuyển sang pool mặc định** tương ứng (và rút khỏi pool của kế hoạch). Tenant chưa cấu hình pool mặc định ⇒ lỗi `Tenant default pool not found`.
- Tạo application: `plan.talentPoolRef` được `$addToSet` vào `talent.pools`.
- Talent đang có hồ sơ `in-progress` ⇒ không tạo hồ sơ khác (xem `applications.md`).

## Điểm chưa chắc

- [ ] UI: trang Talents `/talents`, `/talent-pools`, `/talent-pools/:poolId/talents` — nút thêm talent, form (trường bắt buộc), nhập/xuất, gắn pool — **chưa xem**.
- [ ] Có cách xoá hẳn talent test không (UI có "Delete"?) — API chỉ gỡ khỏi pool. Cần quy ước dọn talent QA (gộp vào một pool `[AUTOTEST]` và để lại?).
- [ ] `total` của pool đếm tay `+1/-1`, `updatePoolCount` với `Operator.MINUS` chạy **trước** khi kiểm còn pool — nếu lỗi thì `total` lệch (xem Nghi bug).
- [ ] Tạo talent trùng email có bị chặn ở UI (gọi `/talents/validate`)? Backend không chặn.
- [ ] Pool "hạn chế tuyển dụng" (hiện trên staging: "Hạn chế tuyển dụng", "Nga pool hạn chế tuyển dụng nè") có ngăn thêm ứng viên vào kế hoạch không? (`talentPoolBlackListRunner` gỡ hạn chế hết hạn hằng ngày 00:00 VN) — chưa đọc luật chặn.
- [ ] Mail/thông báo khi thêm talent vào pool: không thấy.
- [ ] `aiLabels` hiển thị hoặc dùng ở đâu trên UI? — chưa xem UI; nguồn đã xem: `libs/models/src/talent/talent.schema.ts`, `apps/talent-pools/backend/src/talents/talents.service.ts`.
- [ ] `aiLabels` khi nào thì có/không có (`pickTalentAiLabels` ở `@smc/share-function` chưa đọc, diff không có) — nguồn đã xem: `apps/talent-pools/backend/src/talents/talents.service.ts`.
- [ ] `PLAN_UNAVAILABLE` nghĩa là gì và phát sinh khi nào (diff chỉ nhắc mã này trả 400) — nguồn đã xem: `apps/talent-pools/backend/src/talents/talents.service.ts`.
- [ ] `saveCvTexts` (`@smc/share-function`) xử lý thế nào khi `batchId` rỗng hoặc lưu lỗi (chưa đọc) — nguồn đã xem: `apps/talent-pools/backend/src/talents/talents.service.ts`.

## Nghi bug

- 2026-10-11 · (code, chưa có spec) · `shareTalent` (`PATCH /talents/:id/share`) với `isKeep=false`: tăng `total` của pool đích (`updatePoolCount(+1)`, chạy bất đồng bộ không `await`) **trước** khi kiểm `remainingPools.length < 1`; nếu kiểm thất bại → ném `Talent must be in at least one pool` nhưng `total` của pool đích đã `+1` dù talent không được chuyển ⇒ số đếm pool lệch. (`deleteTalent` thì kiểm trước rồi mới trừ nên không có lỗi này.)
- 2026-10-11 · (API, chưa có spec) · `POST /talents` / `POST /talent-pools/:poolId/talents` không chặn trùng `basics.email` — tạo hai talent cùng email được; `createByTalent` sau đó chọn talent theo `findOne` (không xác định).

## Đã đổi theo commit mới

- 3ebed5507 (2026-10-22): `parse-cv` lưu toàn văn CV vào `cv-texts` và trả thêm `aiLabels`; lỗi quota/rate limit đổi thành 429, các lỗi khác là 400 (kể cả `PLAN_UNAVAILABLE`), body có thêm `providerCode`. Talent có trường mới `aiLabels` tách khỏi `tags`. Nguồn: `apps/talent-pools/backend/src/talents/talents.service.ts`, `libs/models/src/talent/talent.schema.ts`.