import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Difficulty = 'easy' | 'medium' | 'hard';
type Result = { wpm: number; accuracy: number; mistakes: number };
type HistoryItem = Result & { id: string; difficulty: Difficulty; duration: number; createdAt: string };

const API = (import.meta.env.VITE_API_URL || 'https://typing-tool-api.onrender.com').replace(/\/$/, '');
const durations = [15, 30, 60];
const HISTORY_KEY = 'leo-typing-tool-history-v1';

function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [duration, setDuration] = useState(30);
  const [target, setTarget] = useState('Loading typing text...');
  const [typed, setTyped] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(30);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
  });

  const elapsed = useMemo(() => startedAt ? Math.max(1, Math.min(duration, Math.round((Date.now() - startedAt) / 1000))) : 0, [startedAt, duration, typed]);
  const liveWpm = elapsed > 0 ? Math.round(((typed.length / 5) / elapsed) * 60) : 0;
  const correct = typed.split('').filter((char, i) => char === target[i]).length;
  const liveAccuracy = typed.length ? Math.round((correct / typed.length) * 100) : 100;
  const best = history.length ? history.reduce((a, b) => b.wpm > a.wpm ? b : a) : null;
  const averageWpm = history.length ? Math.round(history.reduce((sum, item) => sum + item.wpm, 0) / history.length) : 0;
  const averageAccuracy = history.length ? Math.round(history.reduce((sum, item) => sum + item.accuracy, 0) / history.length) : 0;
  const leaderboard = [...history].sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy).slice(0, 5);

  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 30))); }, [history]);

  const loadText = async () => {
    try {
      const r = await fetch(`${API}/api/text?difficulty=${difficulty}`);
      const data = await r.json();
      setTarget(data.text || 'Practice makes progress. Keep typing with accuracy and rhythm.');
    } catch {
      setTarget('Practice makes progress. Keep typing with accuracy and rhythm while staying calm and consistent.');
    }
  };

  const reset = async () => {
    setTyped('');
    setStartedAt(null);
    setRemaining(duration);
    setResult(null);
    await loadText();
  };

  useEffect(() => { void reset(); }, [difficulty, duration]);

  useEffect(() => {
    if (!startedAt || result) return;
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      const next = Math.max(0, duration - seconds);
      setRemaining(next);
      if (next === 0) void finish();
    }, 250);
    return () => window.clearInterval(timer);
  }, [startedAt, result, duration, typed]);

  const saveResult = (finalResult: Result) => {
    const item: HistoryItem = {
      ...finalResult,
      id: crypto.randomUUID(),
      difficulty,
      duration,
      createdAt: new Date().toISOString()
    };
    setHistory(prev => [item, ...prev].slice(0, 30));
  };

  const finish = async () => {
    if (result) return;
    const used = startedAt ? Math.max(1, Math.min(duration, (Date.now() - startedAt) / 1000)) : duration;
    let finalResult: Result;
    try {
      const r = await fetch(`${API}/api/score`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ target, typed, durationSec: used })
      });
      const data = await r.json();
      finalResult = { wpm: Math.round(data.wpm || 0), accuracy: Math.round(data.accuracy || 0), mistakes: data.mistakes || 0 };
    } catch {
      finalResult = { wpm: liveWpm, accuracy: liveAccuracy, mistakes: Math.max(0, typed.length - correct) };
    }
    setResult(finalResult);
    saveResult(finalResult);
  };

  const handleType = (value: string) => {
    if (result || remaining === 0) return;
    if (!startedAt) setStartedAt(Date.now());
    setTyped(value);
  };

  return <main className="app-shell">
    <header>
      <div><span className="eyebrow">LEO DEVELOPMENT LAB</span><h1>Typing Tool</h1><p>Speed, accuracy, rhythm.</p></div>
      <div className="live-badge">FREE ONLY</div>
    </header>

    <section className="controls panel">
      <div><label>Difficulty</label><div className="button-row">{(['easy','medium','hard'] as Difficulty[]).map(d => <button className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)} key={d}>{d}</button>)}</div></div>
      <div><label>Duration</label><div className="button-row">{durations.map(d => <button className={duration === d ? 'active' : ''} onClick={() => setDuration(d)} key={d}>{d}s</button>)}</div></div>
      <button className="restart" onClick={reset}>New Test</button>
    </section>

    <section className="stats-grid">
      <div className="stat panel"><span>TIME</span><strong>{remaining}s</strong></div>
      <div className="stat panel"><span>WPM</span><strong>{result?.wpm ?? liveWpm}</strong></div>
      <div className="stat panel"><span>ACCURACY</span><strong>{result?.accuracy ?? liveAccuracy}%</strong></div>
      <div className="stat panel"><span>MISTAKES</span><strong>{result?.mistakes ?? Math.max(0, typed.length - correct)}</strong></div>
    </section>

    <section className="typing-panel panel">
      <div className="target-text">{target.split('').map((char, i) => <span key={i} className={i < typed.length ? (typed[i] === char ? 'correct' : 'wrong') : i === typed.length ? 'cursor' : ''}>{char}</span>)}</div>
      <textarea autoFocus spellCheck={false} value={typed} onChange={e => handleType(e.target.value)} placeholder="Start typing here..." />
      {result && <div className="result-banner">Finished — {result.wpm} WPM · {result.accuracy}% accuracy</div>}
    </section>

    <section className="insights-grid">
      <div className="panel insights-card">
        <div className="section-title"><div><span className="eyebrow">PERSONAL STATS</span><h2>Your progress</h2></div><button className="ghost" onClick={() => setHistory([])}>Clear history</button></div>
        <div className="mini-stats">
          <div><span>BEST WPM</span><strong>{best?.wpm ?? 0}</strong></div>
          <div><span>AVG WPM</span><strong>{averageWpm}</strong></div>
          <div><span>AVG ACCURACY</span><strong>{averageAccuracy}%</strong></div>
          <div><span>TESTS</span><strong>{history.length}</strong></div>
        </div>
        <div className="history-list">
          {history.length === 0 ? <p className="empty">Complete a test to build your history.</p> : history.slice(0, 6).map(item => <div className="history-row" key={item.id}>
            <div><strong>{item.wpm} WPM</strong><span>{item.accuracy}% accuracy · {item.mistakes} mistakes</span></div>
            <div className="history-meta"><span>{item.difficulty}</span><span>{item.duration}s</span></div>
          </div>)}
        </div>
      </div>

      <div className="panel insights-card">
        <span className="eyebrow">LEADERBOARD</span><h2>Top runs</h2>
        <div className="leaderboard">
          {leaderboard.length === 0 ? <p className="empty">No scores yet.</p> : leaderboard.map((item, index) => <div className="leader-row" key={item.id}>
            <span className="rank">#{index + 1}</span>
            <div><strong>{item.wpm} WPM</strong><span>{item.accuracy}% accuracy</span></div>
            <div className="score-mode">{item.difficulty} · {item.duration}s</div>
          </div>)}
        </div>
      </div>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
