import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { getTypingText, scoreTyping, type Difficulty } from 'backend';

const app = express();
const port = Number(process.env.PORT || 4000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://typing-tool-pu0o.onrender.com,http://localhost:5173')
  .split(',').map(v => v.trim()).filter(Boolean);
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

app.set('trust proxy', 1);
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  }
}));
app.use(express.json({ limit: '50kb' }));

function normalizeNickname(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}
function nicknameKey(value: string) { return value.toLocaleLowerCase(); }
function validNickname(value: string) {
  return value.length >= 2 && value.length <= 24 && /^[\p{L}\p{N} _.-]+$/u.test(value);
}
async function upsertProfile(nickname: string) {
  if (!pool) throw new Error('database unavailable');
  const { rows } = await pool.query(
    `INSERT INTO typing_profiles (nickname, nickname_key)
     VALUES ($1, $2)
     ON CONFLICT (nickname_key)
     DO UPDATE SET nickname = EXCLUDED.nickname, updated_at = now()
     RETURNING id, nickname, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [nickname, nicknameKey(nickname)]
  );
  return rows[0];
}

app.get('/api/health', async (_req, res) => {
  let database = 'not-configured';
  if (pool) {
    try { await pool.query('SELECT 1'); database = 'connected'; }
    catch { database = 'error'; }
  }
  res.json({ ok: true, service: 'typing-tool-api', database, now: new Date().toISOString() });
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
  if (!target || durationSec <= 0) return res.status(400).json({ error: 'target and positive durationSec are required' });
  res.json(scoreTyping(target, typed, durationSec));
});

app.post('/api/profile', async (req, res) => {
  const nickname = normalizeNickname(req.body?.nickname);
  if (!validNickname(nickname)) return res.status(400).json({ error: 'Nickname must be 2-24 characters and use letters, numbers, spaces, dot, dash or underscore.' });
  if (!pool) return res.status(503).json({ error: 'Online profiles are not configured' });
  try {
    const profile = await upsertProfile(nickname);
    return res.status(201).json({ ok: true, profile });
  } catch (error) {
    console.error('profile error', error);
    return res.status(500).json({ error: 'Unable to save profile' });
  }
});

app.post('/api/results', async (req, res) => {
  const nickname = normalizeNickname(req.body?.nickname);
  const difficulty = String(req.body?.difficulty || '') as Difficulty;
  const target = String(req.body?.target || '');
  const typed = String(req.body?.typed || '');
  const durationSec = Number(req.body?.durationSec || 0);
  if (!validNickname(nickname)) return res.status(400).json({ error: 'Valid nickname is required' });
  if (!['easy', 'medium', 'hard'].includes(difficulty)) return res.status(400).json({ error: 'Invalid difficulty' });
  if (!target || !Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 300) return res.status(400).json({ error: 'Valid target and duration are required' });
  if (!pool) return res.status(503).json({ error: 'Online results are not configured' });

  const score = scoreTyping(target, typed, durationSec);
  const wpm = Math.max(0, Math.min(500, Math.round(score.wpm || 0)));
  const accuracy = Math.max(0, Math.min(100, Math.round(score.accuracy || 0)));
  const mistakes = Math.max(0, Math.round(score.mistakes || 0));
  try {
    const profile = await upsertProfile(nickname);
    const { rows } = await pool.query(
      `INSERT INTO typing_results
       (profile_id, difficulty, duration_sec, wpm, accuracy, mistakes, typed_chars)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, difficulty, duration_sec AS duration, wpm, accuracy, mistakes,
                 typed_chars AS "typedChars", created_at AS "createdAt"`,
      [profile.id, difficulty, Math.round(durationSec), wpm, accuracy, mistakes, typed.length]
    );
    return res.status(201).json({ ok: true, profile, result: rows[0] });
  } catch (error) {
    console.error('result save error', error);
    return res.status(500).json({ error: 'Unable to save result' });
  }
});

app.get('/api/results', async (req, res) => {
  const nickname = normalizeNickname(req.query.nickname);
  if (!validNickname(nickname)) return res.status(400).json({ error: 'Valid nickname is required' });
  if (!pool) return res.status(503).json({ error: 'Online results are not configured' });
  try {
    const { rows } = await pool.query(
      `SELECT r.id, p.nickname, r.difficulty, r.duration_sec AS duration, r.wpm, r.accuracy,
              r.mistakes, r.typed_chars AS "typedChars", r.created_at AS "createdAt"
       FROM typing_results r
       JOIN typing_profiles p ON p.id = r.profile_id
       WHERE p.nickname_key = $1
       ORDER BY r.created_at DESC
       LIMIT 30`,
      [nicknameKey(nickname)]
    );
    return res.json({ ok: true, results: rows });
  } catch (error) {
    console.error('history error', error);
    return res.status(500).json({ error: 'Unable to load result history' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Online leaderboard is not configured' });
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
  try {
    const { rows } = await pool.query(
      `SELECT r.id, p.nickname, r.difficulty, r.duration_sec AS duration, r.wpm, r.accuracy,
              r.mistakes, r.created_at AS "createdAt"
       FROM typing_results r
       JOIN typing_profiles p ON p.id = r.profile_id
       ORDER BY r.wpm DESC, r.accuracy DESC, r.created_at ASC
       LIMIT $1`,
      [limit]
    );
    return res.json({ ok: true, leaderboard: rows });
  } catch (error) {
    console.error('leaderboard error', error);
    return res.status(500).json({ error: 'Unable to load leaderboard' });
  }
});

app.listen(port, () => {
  console.log(`Typing Tool API listening on :${port}`);
});
