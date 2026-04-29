const express = require('express');
const path = require('path');
const { getDiskInfo, scan, browse, deleteItems } = require('./scanner');

const app = express();
const PORT = 3456;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/disk', (_req, res) => res.json(getDiskInfo()));

app.get('/api/scan', async (_req, res) => res.json(await scan()));

app.get('/api/browse', async (req, res) => {
  const result = await browse(req.query.path);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/delete', async (req, res) => {
  const result = await deleteItems(req.body.items);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  🧹 MacSweep (dev)\n  📍 http://localhost:${PORT}\n`);
});
