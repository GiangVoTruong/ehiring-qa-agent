---
flow: users-and-permissions
learnedCommit: 3ebed5507
learnedAt: 2026-10-22
tenant: shinhanbank (staging)
status: học từ code (chưa xem UI); CHƯA có flow/test
sources:
  - libs/smc/auth-decorator/src/lib/service/smc-auth-decorator.class.ts
  - apps/users/backend/src/app/users/users.{service,controller}.ts
  - apps/users/backend/src/app/user-groups/user-groups.service.ts
  - libs/smc/check-role-stage/src/lib/smc-check-role-stage.service.ts
  - apps/recruitment/backend/.../recruitment-requests.service.ts (handleTags, huỷ YCTD theo nhóm SYS_ADM)
---

# Người dùng, nhóm người dùng, phân quyền

## Hai lớp quyền

1. **Quyền theo chức năng (RBAC) — `AuthDecorator`** (chạy ở mọi controller): mỗi endpoint gắn `@Feature('<tên>')` ở class và `@Action('<hành động>')` ở route. Token đăng nhập (JWT từ Keycloak) mang danh sách `roles` dạng `<tính-năng>:<phạm vi>`; backend lọc `roles` bắt đầu bằng tên tính năng rồi ghép phạm vi → các action được phép.
   - Phạm vi: `create`, `read`, `update`, `delete`, `manage` (chỉ **bản ghi của mình**: `allowAll=false`), và bản **`...All`** (`createAll`, `readAll`, …) hoặc `*` (mọi action, **`allowAll=true`** = thấy/sửa mọi bản ghi).
   - Action chuẩn: `Read-All` · `Read-One` · `Create-One` · `Create-Many` · `Update-One` · `Replace-One` · `Delete-One` · `Manage-One` · `Manage-All`.
   - Thiếu role ⇒ **403** từ guard (trước khi vào nghiệp vụ). `user.allowAll` được đặt từ role.
2. **Quyền theo dữ liệu**: `CheckPublicInterceptor` (mỗi resource): bản ghi thấy được khi `isPublic`, hoặc mình là `createdBy`, hoặc có tên trong trường liên quan (`assignTo`, `approvers`, `requestedBy`, …), hoặc khớp `tags` của user. `allowAll` bỏ qua giới hạn này. Quyền **theo vòng** của hồ sơ ứng viên: `checkRoleUserStage` (xem `applications.md`).

→ Tài khoản QA `dev_shinhanbank` hiển thị là System Admin và có `allowAll` ở nhiều resource (YCTD, kế hoạch…), **nhưng không phải toàn quyền**: trang `/user-groups` chuyển sang `/unauthorized` (quan sát 2026-10-11). Quyền theo từng tính năng, nên vẫn có thể kiểm được một số trường hợp bị từ chối (ví dụ `/user-groups`). Muốn kiểm thử phân quyền cần thêm tài khoản hạn chế (vai trò thường: người duyệt, người phỏng vấn, TA).

## Người dùng (`users`)

- `UserStatus`: `active` · `inactive`. Bộ chọn người trong form chỉ liệt kê `status ∈ {active, null}`.
- API: `GET /users` (lọc theo trạng thái; tìm text không còn được service chuyển thành điều kiện `$or` regex trên `userName`/`email`/`name` — nguồn: `users.service.ts`, commit 3ebed5507), `GET /users/full`, `GET /users/me`, `PATCH /users/:id`, `PATCH /users/:id/languages` (`meta.language`, **bắt buộc `language`**), `DELETE /users/:id` (xoá mềm).
- **Cập nhật người dùng** (`updateUser`): tính lại `tags` của user:
  - Không còn nhóm nào ⇒ `tags = []`.
  - Tag dạng `groups.code:<mã>` chỉ giữ khi mã đó còn thuộc nhóm của user.
  - Nếu một nhóm của user có tag **`SYS_ADM`** và user có `departmentCode` ⇒ thêm tag `departmentCode:<mã>` (**quản trị viên phòng ban** thấy bản ghi của phòng đó — dùng ở `handleTags` của YCTD/kế hoạch).
- Người dùng đến từ Keycloak/HRIS (tích hợp `integration/users`, `TRANSFORM_USER_FROM_INTEGRATION`); đa số không tạo tay trong ATS.

## Nhóm người dùng (`user-groups`)

- Nhóm có `code`, `tags`, `groups` (cây phòng ban con), vai trò `UserGroupRole.ADMIN`; `GET /user-groups` trả kèm `userCount` và nhóm con.
- **Tag nhóm đặc biệt** đang được code dùng: `SYS_ADM` / `SYS_ADM_ROOT` (hủy được YCTD của người khác; thấy YCTD/kế hoạch cùng phòng), `RECRUITMENT_ADM` / `RECRUITER` (mặc định điền vào **TA Admin** khi tạo YCTD — xem `recruitment-requests.md`).
- Nhóm lưu quyền chức năng? Role trong token đến từ Keycloak (client roles), **không** đọc từ `user-groups` ở backend; màn `user-permission` (UI) cấu hình ánh xạ — chưa đọc.

## Đã đổi theo commit mới

- 2026-10-22 · commit 3ebed5507 · `users.service.ts`: xoá `applyTextSearch` / `createUserTextSearch` (chuyển `$text` thành `$or` regex trên `userName`, `email`, `name`) và bỏ lệnh gọi trong hàm lọc danh sách `GET /users`. Phần ô tìm text ở mục API trên đã được cập nhật theo.

## Điểm chưa chắc

- [ ] UI: `/user-groups`, `/user-groups/:id`, `/user-permission` — chưa xem; màn quản lý phân quyền sửa gì (role Keycloak hay dữ liệu ATS)? — nguồn đã xem: chưa có
- [ ] Danh sách role thật của tài khoản QA (token); tính năng nào có `*` / `readAll`. — nguồn đã xem: smc-auth-decorator.class.ts
- [ ] `DELETE /users/:id` — UI có nút xoá/vô hiệu hoá user không; xoá mềm user đang là `assignTo` của kế hoạch thì sao? — nguồn đã xem: users.service.ts, users.controller.ts
- [ ] Cách tạo thêm tài khoản kiểm thử vai trò hạn chế (cần user/vận hành cấp) để kiểm quyền 403. — nguồn đã xem: smc-auth-decorator.class.ts
- [ ] `updateUser` nhận `body.groups` nhưng tìm nhóm bằng `groups: {$in: body.groups}` trên **chính collection user-groups** (tức tìm nhóm *cha* chứa các nhóm đó), không phải nhóm của user — cố ý (lấy mã phòng ban cha)? — nguồn đã xem: users.service.ts
- [ ] Sau khi bỏ `applyTextSearch`, tham số `$text` từ UI còn được đưa xuống query Mongo không? Collection `users` có text index không? Tìm theo tên/email/userName trên UI còn hoạt động không? — nguồn đã xem: users.service.ts (diff 3ebed5507)

## Nghi bug

- 2026-10-11 · (code, chưa có spec) · `updateUser`: nếu `body.groups` rỗng/không gửi thì `find({groups:{$in: undefined}})` → `userGroups.length === 0` ⇒ `body.tags = []` **xoá toàn bộ tag của user** ngay cả khi `PATCH` chỉ đổi trường khác (vd chỉ đổi tên) và user vẫn thuộc nhóm. Cần kiểm trên UI/API: sửa thông tin user không kèm `groups` có làm mất `departmentCode:` / `groups.code:` tags (→ mất quyền xem bản ghi theo phòng)?