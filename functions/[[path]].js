import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

// 分割したモジュールをすべて読み込む
import { setupApi } from '../src/api.js';
import { setupTools } from '../src/tools.js';
import { setupDiary } from '../src/diary.js';
import { setupAdmin } from '../src/admin.js';
import { setupImage } from '../src/image.js';
import { setupNews } from '../src/news.js';
import { setupPages } from '../src/pages.js';

const app = new Hono();

// ルーティング（各機能）をセットアップ
setupApi(app);
setupTools(app);
setupDiary(app);
setupAdmin(app);
setupImage(app);
setupNews(app);
setupPages(app); // 画面描画用

// Cloudflare Pagesの処理としてエクスポート
export const onRequest = handle(app);