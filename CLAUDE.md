# CLAUDE.md

AI kiểm thử E2E và ghi nhớ nghiệp vụ luồng web eHiring. Trả lời và viết knowledge bằng tiếng Việt.

## Cấu trúc (3 lớp, không trộn)

| Thư mục | Chứa gì | Không chứa |
| --- | --- | --- |
| `knowledge/<luồng>.md` | Nghiệp vụ: trạng thái, quyền, quy tắc dữ liệu, tác dụng phụ, điểm chưa chắc, nghi bug | Code |
| `flows/<luồng>.ts` | Hàm thao tác UI tái dùng (`create`, `approve`…) | Assertion nghiệp vụ |
| `tests/<luồng>/*.spec.ts` | Kịch bản ghép flows + assertion lấy từ knowledge | Thao tác UI chi tiết lặp lại |
| `tests/unit/` | Unit test cho logic không phải UI | — |

Khung knowledge bắt buộc (frontmatter `flow`, `learnedCommit`, `learnedAt`; các mục `## Trạng thái & chuyển trạng thái`, `## Quyền / vai trò`, `## Quy tắc dữ liệu`, `## Tác dụng phụ`, `## Điểm chưa chắc`, `## Nghi bug`).

## Nguồn học — repo ehiring CHỈ ĐỌC

- Đọc bằng `git -C D:\CTY\SMC\ehiring show origin/develop:<path>` và `git -C D:\CTY\SMC\ehiring grep <pattern> origin/develop`.
- Không checkout, không sửa, không commit gì trong `D:\CTY\SMC\ehiring`.
- Ghi `learnedCommit` = `git -C D:\CTY\SMC\ehiring rev-parse --short origin/develop` lúc học. Knowledge cũ khi sha này khác `origin/develop`.
- Không suy đoán từ cờ cấu hình; điều chưa thấy tận mắt trên UI hoặc trong code → ghi vào `## Điểm chưa chắc`.

## An toàn dữ liệu (staging dùng DB chung nhiều tenant)

- Môi trường duy nhất: `BASE_URL` trong `.env` (staging shinhanbank). Chỉ thao tác qua UI; `page.request` chỉ dùng để **đọc**.
- Mọi bản ghi tạo ra phải đặt tên qua `qaTitle()` (tiền tố `[AUTOTEST]`) và ghi vào registry (`flows/common.ts`).
- Người duyệt / assignTo / managerName luôn là tài khoản QA trong `.env` — tạo/duyệt gửi email và thông báo thật.
- Không xoá dữ liệu trừ khi user yêu cầu; khi xoá chỉ xoá bản ghi vừa có trong registry vừa có tiền tố.
  Lệnh dọn: `npm run cleanup` (project `cleanup`, `tests/cleanup/*.cleanup.ts`) — ngoại lệ duy nhất được gọi API ghi:
  UI không có nút xoá YCTD nên xoá mềm qua `DELETE /api/recruitment-requests/:id`, bỏ qua YCTD đã có kế hoạch, rồi gỡ khỏi
  registry. Test dọn tự skip nếu thiếu `QA_CLEANUP=1` (chỉ `npm run cleanup` đặt biến này) — đừng bỏ chốt này.
- Không in, log hay commit mật khẩu, TOTP secret, `.auth/`.

## Chạy

- `npm test` (toàn bộ), `npm run test:unit`, `npx playwright test --project=e2e tests/<luồng>`.
- Trình duyệt: Chrome hệ thống (`channel: 'chrome'`), không cài Chromium.
- Gọi `forceEnglish(page)` trước khi điều hướng — selector dựa trên nhãn tiếng Anh. Ưu tiên `getByRole` / `getByLabel`.

## Khi test đỏ

- Do selector/timing → được sửa locator/wait.
- Do hành vi app khác knowledge → **giữ test đỏ**, không sửa `expect`, không `test.fixme`/`skip`. Thêm một dòng vào `## Nghi bug` của knowledge: `- YYYY-MM-DD · <spec › test> · <mô tả> · <đường dẫn trace>`. User quyết định đó là bug hay knowledge sai.

## Agents (`.claude/agents/`)

Thứ tự cho một luồng mới: **`ehiring-learner`** (viết `knowledge/<luồng>.md`) → user chốt "Điểm chưa chắc" →
**`playwright-test-planner`** (`specs/<luồng>.md`) → **`playwright-test-generator`** (`tests/<luồng>/`, dùng `flows/`) →
**`playwright-test-healer`** khi test đỏ (chỉ sửa lỗi kỹ thuật; lệch nghiệp vụ → giữ đỏ + ghi Nghi bug).
Ba agent Playwright sinh bằng `npx playwright init-agents --loop=claude` rồi chỉnh — **chạy lại lệnh đó sẽ ghi đè phần chỉnh**.
Seed chung: `tests/seed.spec.ts`. MCP `playwright-test` (`.mcp.json`) dùng project đầu tiên trong config (`e2e`).

## Git

- Không commit `docs/ai/`, `.ai-devkit.json`, `.env`, `.auth/`, `.qa-registry.json` (đã có trong `.gitignore`). Stage file cụ thể.
- Conventional Commits, tiếng Anh.

- Dữ liệu đã tạo từ trước với tiền tố cũ `[QA-AUTO]` vẫn được nhận ra để dọn/dùng lại (`LEGACY_PREFIXES` trong `flows/common.ts`), nhưng KHÔNG được dùng tiền tố đó khi đặt tên mới.
