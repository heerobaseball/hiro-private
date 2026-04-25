import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

// 分割したモジュールをすべて読み込む
import { setupApi } from '../src/api.js';
import { setupTools } from '../src/tools.js';
import { setupDiary } from '../src/diary.js';
import { setupAdmin } from '../src/admin.js';
import { setupImage } from '../src/image.js';
import { setupNews } from '../src/news.js';
import { setupTime } from '../src/time.js'; // ★ 新しく追加
import { setupPages } from '../src/pages.js';

const app = new Hono();

// ルーティング（各機能）をセットアップ
setupApi(app);
setupTools(app);
setupDiary(app);
setupAdmin(app);
setupImage(app);
setupNews(app);
setupTime(app);  // ★ 新しく追加 (時刻API)
setupPages(app); // 画面描画用 (最後に実行)

// Cloudflare Pagesの処理としてエクスポート
export const onRequest = handle(app);