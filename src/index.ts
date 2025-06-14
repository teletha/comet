import { Hono } from 'hono';

// D1 バインディングの型を any で暫定対応
interface Env {
  DB: any;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('Hello from Hono on Cloudflare Workers!'));

// D1 カウンターエンドポイント
app.get('/d1', async (c) => {
  // カウンターテーブル作成（初回のみ）
  await c.env.DB.exec('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER);');
  // 現在値取得
  let row = await c.env.DB.prepare('SELECT value FROM counter WHERE id = 1;').first();
  let value = row?.value ?? 0;
  // インクリメント
  value++;
  // 値を保存
  if (row) {
    await c.env.DB.prepare('UPDATE counter SET value = ? WHERE id = 1;').bind(value).run();
  } else {
    await c.env.DB.prepare('INSERT INTO counter (id, value) VALUES (1, ?);').bind(value).run();
  }
  return c.json({ value });
});

export default app;
