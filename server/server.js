import express from 'express';
import cors from 'cors';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { nanoid } from 'nanoid';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 提供静态文件服务
app.use(express.static('.'));

// 简易 JSON 存储
const db = new Low(new JSONFile('./data.json'), { items: [], history: [] });
await db.read();
db.data ||= { items: [], history: [] };

// 获取当前数据
app.get('/api/data', async (req, res) => {
  await db.read();
  res.json({ items: db.data.items || [] });
});

// 更新/替换数据（保存一个历史点）
app.post('/api/data', async (req, res) => {
  const nextItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const before = db.data.items || [];
  db.data.items = nextItems;
  db.data.history = [{ id: nanoid(), action: 'upsert', time: Date.now(), before, after: nextItems }, ...(db.data.history || [])].slice(0, 500);
  await db.write();
  res.json({ ok: true });
});

// 记录前端快照
app.post('/api/history', async (req, res) => {
  const { id, action, time, before, after } = req.body || {};
  const rec = { id: id || nanoid(), action: action || 'unknown', time: time || Date.now(), before: Array.isArray(before) ? before : [], after: Array.isArray(after) ? after : [] };
  db.data.history = [rec, ...(db.data.history || [])].slice(0, 500);
  await db.write();
  res.json({ ok: true });
});

// 获取历史
app.get('/api/history', async (req, res) => {
  await db.read();
  res.json({ history: db.data.history || [] });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});




