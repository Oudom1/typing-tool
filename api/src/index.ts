import express from 'express';
import cors from 'cors';
import { getTypingText, scoreTyping, type Difficulty } from 'backend';

const app = express();
const port = Number(process.env.PORT || 4000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://oudom1.github.io,http://localhost:5173')
  .split(',').map(v => v.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  }
}));
app.use(express.json({ limit: '50kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'typing-tool-api', now: new Date().toISOString() });
});

app.get('/api/text', (req, res) => {
  const difficulty = String(req.query.difficulty || 'medium') as Difficulty;
  if (!['easy', 'medium', 'hard'].includes(difficulty)) {
    return res.status(400).json({ error: 'difficulty must be easy, medium, or hard' });
  }
  res.json({ difficulty, text: getTypingText(difficulty) });
});

app.post('/api/score', (req, res) => {
  const target = String(req.body?.target || '');
  const typed = String(req.body?.typed || '');
  const durationSec = Number(req.body?.durationSec || 0);
  if (!target || durationSec <= 0) {
    return res.status(400).json({ error: 'target and positive durationSec are required' });
  }
  res.json(scoreTyping(target, typed, durationSec));
});

app.listen(port, () => {
  console.log(`Typing Tool API listening on :${port}`);
});
