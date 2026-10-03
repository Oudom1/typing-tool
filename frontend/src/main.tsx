import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Difficulty = 'easy' | 'medium' | 'hard';
type Result = { wpm: number; accuracy: number; mistakes: number };

const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const durations = [15, 30, 60];

function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [duration, setDuration] = useState(30);
  const [target, setTarget] = useState('Loading typing text...');
  const [typed, setTyped] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(30);
  const [result, setResult] = useState<Result | null>(null);

  const elapsed = useMemo(() => startedAt ? Math.max(1, Math.min(duration, Math.round((Date.now() - startedAt) / 1000))) : 0, [startedAt, duration, typed]);
  const liveWpm = elapsed > 0 ? Math.round(((typed.length / 5) / elapsed) * 60) : 0;
  const correct = typed.split('').filter((char, i) => char === target[i]).length;
  const liveAccuracy = typed.length ? Math.round((correct / typed.length) * 100) : 100;

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

  useEffect(() => { reset(); }, [difficulty, duration]);

  useEffect(() => {
    if (!startedAt || result) return;
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      const next = Math.max(0, duration - seconds);
      setRemaining(next);
      if (next === 0) finish();
    }, 250);
    return () => window.clearInterval(timer);
  }, [startedAt, result, duration, typed]);

  const finish = async () => {
    if (result) return;
    const used = startedAt ? Math.max(1, Math.min(duration, (Date.now() - startedAt) / 1000)) : duration;
    try {
      const r = await fetch(`${API}/api/score`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ target, typed, durationSec: used })
      });
      const data = await r.json();
      setResult({ wpm: Math.round(data.wpm || 0), accuracy: Math.round(data.accuracy || 0), mistakes: data.mistakes || 0 });
    } catch {
      setResult({ wpm: liveWpm, accuracy: liveAccuracy, mistakes: Math.max(0, typed.length - correct) });
    }
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
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
