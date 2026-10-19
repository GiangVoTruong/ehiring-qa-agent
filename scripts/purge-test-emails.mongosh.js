// Xoá HẲN mail test khỏi collection `emails`.
// DB staging là `ehiring-tanlong-stg` và chứa dữ liệu của MỌI tenant → bộ lọc `tenant: 'shinhanbank'` là bắt buộc.
// Không chạy tự động. Chạy bằng mongosh:
//   mongosh "<chuỗi kết nối>" --file scripts/purge-test-emails.mongosh.js
// Mặc định chỉ ĐẾM (dryRun). Đổi DRY_RUN = false rồi chạy lại để xoá.
const DRY_RUN = true;

db = db.getSiblingDB('ehiring-tanlong-stg');
if (db.getName() !== 'ehiring-tanlong-stg') throw new Error('Sai database: ' + db.getName());

// Chỉ mail đã được xoá mềm bởi `npm run cleanup` (__isDeleted: true), của tenant shinhanbank, chứa [QA-AUTO],
// và gửi tới đúng tài khoản QA.
const filter = {
  tenant: 'shinhanbank',
  __isDeleted: true,
  $or: [{ subject: /\[(AUTOTEST|QA-AUTO)\]/ }, { body: /\[(AUTOTEST|QA-AUTO)\]/ }],
  'recipient.email': 'dev_shinhanbank@shinhanbank.com', // nếu recipient lưu dạng chuỗi: thử { recipient: /dev_shinhanbank@shinhanbank\.com/ }
};

const col = db.getCollection('emails');
const total = col.countDocuments(filter);
print(`database: ${db.getName()} — khớp bộ lọc: ${total}`);
print(`ngoài bộ lọc (KHÔNG đụng tới) chứa [QA-AUTO]: ${col.countDocuments({ $or: [{ subject: /\[(AUTOTEST|QA-AUTO)\]/ }, { body: /\[(AUTOTEST|QA-AUTO)\]/ }], $nor: [filter] })}`);

if (DRY_RUN) {
  print('DRY_RUN = true → chưa xoá gì. Kiểm tra 3 bản mẫu:');
  col.find(filter, { subject: 1, recipient: 1, createdAt: 1 }).limit(3).forEach(printjson);
} else {
  const r = col.deleteMany(filter);
  print(`đã xoá ${r.deletedCount} bản ghi`);
}
