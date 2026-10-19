// Dọn thông báo (chuông) rác do test sinh ra — API không có DELETE nên xoá trực tiếp trong Mongo.
// Chạy kèm nút "Dọn dữ liệu test" trên web (hoặc tay: node scripts/purge-notifications.mjs [--apply]).
// Mặc định chỉ ĐẾM; có --apply mới xoá. Chỉ đụng tenant shinhanbank + đúng user QA + có [AUTOTEST] (hoặc [QA-AUTO] cũ) trong nội dung
// (hoặc, nếu QA_NOTI_SINCE=<ISO> được đặt, mọi thông báo của user QA từ mốc đó).
// Kết nối: QA_MONGO_URI trong .env (vd mongodb://user:pass@10.86.62.181:27017). Không có → thử host mặc định không mật khẩu.
// Driver `mongodb` lấy từ node_modules của repo eHiring (QA_MONGODB_DRIVER để đổi) — không thêm dependency mới.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
const APPLY = process.argv.includes('--apply');
const DB = 'ehiring-tanlong-stg';
const QA_USERNAME = process.env.QA_USERNAME || 'dev_shinhanbank';

const driverPath = process.env.QA_MONGODB_DRIVER || resolve(ROOT, '..', 'ehiring', 'node_modules', 'mongodb');
let MongoClient;
try {
  ({ MongoClient } = createRequire(import.meta.url)(driverPath));
} catch {
  console.log(`BỎ QUA dọn thông báo: không nạp được driver mongodb (${driverPath}). Đặt QA_MONGODB_DRIVER hoặc chạy scripts/purge-test-notifications.mongosh.js.`);
  process.exit(0);
}

// URI: QA_MONGO_URI (.env của agent) → MONGODB_URI trong .env của repo eHiring (cấu hình có sẵn của dev) → host mặc định.
function repoMongoUri() {
  const f = resolve(ROOT, '..', 'ehiring', '.env');
  if (!existsSync(f)) return undefined;
  return readFileSync(f, 'utf8').match(/^MONGODB_URI=(.+)$/m)?.[1]?.trim();
}
const client = new MongoClient(process.env.QA_MONGO_URI || repoMongoUri() || 'mongodb://10.86.62.181:27017', { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
} catch (e) {
  console.log(`BỎ QUA dọn thông báo: không kết nối được Mongo (${e.message}). Cần VPN/mạng nội bộ và QA_MONGO_URI trong .env, hoặc chạy scripts/purge-test-notifications.mongosh.js.`);
  process.exit(0);
}
try {
  const db = client.db(DB);
  const qa = await db.collection('users').findOne({ tenant: 'shinhanbank', $or: [{ username: QA_USERNAME }, { email: new RegExp(QA_USERNAME) }] });
  if (!qa) {
    console.log(`BỎ QUA dọn thông báo: không tìm thấy user ${QA_USERNAME} (tenant shinhanbank).`);
    process.exit(0);
  }
  const mine = { tenant: 'shinhanbank', user: qa._id };
  const marker = /\[(?:AUTOTEST|QA-AUTO)\]/;
  const filter = process.env.QA_NOTI_SINCE
    ? { ...mine, createdAt: { $gte: new Date(process.env.QA_NOTI_SINCE) } }
    : { ...mine, $or: ['en-US', 'vi-VN'].flatMap((l) => ['title', 'content'].map((k) => ({ [`data.rendered.${l}.${k}`]: marker }))) };
  const col = db.collection('notifications');
  const matched = await col.countDocuments(filter);
  const all = await col.countDocuments(mine);
  if (!APPLY) {
    console.log(`THÔNG BÁO: khớp ${matched} / tổng của QA ${all} (chỉ đếm — thêm --apply để xoá)`);
  } else {
    const r = await col.deleteMany(filter);
    console.log(`THÔNG BÁO: đã xoá ${r.deletedCount} / tổng của QA trước đó ${all}`);
  }
} finally {
  await client.close();
}
