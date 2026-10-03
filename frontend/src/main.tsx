import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Difficulty = 'easy' | 'medium' | 'hard';
type Result = { wpm: number; accuracy: number; mistakes: number };
type HistoryItem = Result & { id: string; difficulty: Difficulty; duration: number; createdAt: string; nickname?: string };

const API = (import.meta.env.VITE_API_URL || 'https://typing-tool-api.onrender.com').replace(/\/$/, '');
const durations = [15, 30, 60];
const HISTORY_KEY = 'leo-typing-tool-history-v1';
const NICKNAME_KEY = 'leo-typing-tool-nickname-v1';
const LEVEL_KEY = 'leo-typing-tool-level-v1';
const CHALLENGE_TARGET = 10;
const challengeChars = 'abcdefghijklmnopqrstuvwxyz1234567890'.split('');

function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [duration, setDuration] = useState(30);
  const [target, setTarget] = useState('Loading typing text...');
  const [typed, setTyped] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(30);
  const [result, setResult] = useState<Result | null>(null);
  const [nickname, setNickname] = useState(() => localStorage.getItem(NICKNAME_KEY) || '');
  const [profileStatus, setProfileStatus] = useState('Local mode');
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
  });
  const [leaderboard, setLeaderboard] = useState<HistoryItem[]>([]);
  const [level, setLevel] = useState(() => Math.max(1, Number(localStorage.getItem(LEVEL_KEY) || 1)));
  const [challengeStarted, setChallengeStarted] = useState(false);
  const [fallingChar, setFallingChar] = useState('a');
  const [fallProgress, setFallProgress] = useState(0);
  const [gameScore, setGameScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameMessage, setGameMessage] = useState('Type the falling character before it reaches the valley.');
  const [gameEnded, setGameEnded] = useState(false);

  const isChallenge = level % 5 === 0;
  const nextChallenge = isChallenge ? level : level + (5 - (level % 5));
  const elapsed = useMemo(() => startedAt ? Math.max(1, Math.min(duration, Math.round((Date.now() - startedAt) / 1000))) : 0, [startedAt, duration, typed]);
  const liveWpm = elapsed > 0 ? Math.round(((typed.length / 5) / elapsed) * 60) : 0;
  const correct = typed.split('').filter((char, i) => char === target[i]).length;
  const liveAccuracy = typed.length ? Math.round((correct / typed.length) * 100) : 100;
  const best = history.length ? history.reduce((a, b) => b.wpm > a.wpm ? b : a) : null;
  const averageWpm = history.length ? Math.round(history.reduce((sum, item) => sum + item.wpm, 0) / history.length) : 0;
  const averageAccuracy = history.length ? Math.round(history.reduce((sum, item) => sum + item.accuracy, 0) / history.length) : 0;

  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 30))); }, [history]);
  useEffect(() => { localStorage.setItem(LEVEL_KEY, String(level)); }, [level]);
  useEffect(() => { void loadLeaderboard(); }, []);

  const loadLeaderboard = async () => {
    try {
      const r = await fetch(`${API}/api/leaderboard?limit=10`);
      const data = await r.json();
      if (r.ok) setLeaderboard(data.leaderboard || []);
    } catch {}
  };

  const syncProfile = async () => {
    const clean = nickname.trim();
    if (clean.length < 2) { setProfileStatus('Enter at least 2 characters'); return; }
    try {
      const r = await fetch(`${API}/api/profile`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ nickname: clean }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Unable to save profile');
      localStorage.setItem(NICKNAME_KEY, clean);
      setNickname(clean);
      setProfileStatus('Online profile synced');
      const h = await fetch(`${API}/api/results?nickname=${encodeURIComponent(clean)}`);
      const hd = await h.json();
      if (h.ok) setHistory(hd.results || []);
      await loadLeaderboard();
    } catch (e) {
      setProfileStatus(e instanceof Error ? e.message : 'Profile sync unavailable');
    }
  };

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

  useEffect(() => { if (!isChallenge) void reset(); }, [difficulty, duration, isChallenge]);
  useEffect(() => {
    if (!startedAt || result || isChallenge) return;
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      const next = Math.max(0, duration - seconds);
      setRemaining(next);
      if (next === 0) void finish();
    }, 250);
    return () => window.clearInterval(timer);
  }, [startedAt, result, duration, typed, isChallenge]);

  const saveLocalResult = (finalResult: Result) => {
    const item: HistoryItem = { ...finalResult, id: crypto.randomUUID(), difficulty, duration, createdAt: new Date().toISOString(), nickname: nickname.trim() || undefined };
    setHistory(prev => [item, ...prev].slice(0, 30));
  };

  const finish = async () => {
    if (result || isChallenge) return;
    const used = startedAt ? Math.max(1, Math.min(duration, (Date.now() - startedAt) / 1000)) : duration;
    let finalResult: Result;
    try {
      const r = await fetch(`${API}/api/score`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ target, typed, durationSec: used }) });
      const data = await r.json();
      finalResult = { wpm: Math.round(data.wpm || 0), accuracy: Math.round(data.accuracy || 0), mistakes: data.mistakes || 0 };
    } catch {
      finalResult = { wpm: liveWpm, accuracy: liveAccuracy, mistakes: Math.max(0, typed.length - correct) };
    }
    setResult(finalResult);
    if (finalResult.accuracy >= 80) setLevel(prev => prev + 1);

    const cleanNickname = nickname.trim();
    if (cleanNickname.length >= 2) {
      try {
        const r = await fetch(`${API}/api/results`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ nickname: cleanNickname, difficulty, target, typed, durationSec: used }) });
        const data = await r.json();
        if (r.ok) {
          localStorage.setItem(NICKNAME_KEY, cleanNickname);
          setHistory(prev => [{ ...data.result, nickname: data.profile?.nickname || cleanNickname }, ...prev.filter(x => x.id !== data.result.id)].slice(0, 30));
          setProfileStatus(finalResult.accuracy >= 80 ? 'Result synced — level cleared' : 'Result synced — reach 80% accuracy to level up');
          await loadLeaderboard();
          return;
        }
      } catch {}
    }
    saveLocalResult(finalResult);
    setProfileStatus(finalResult.accuracy >= 80 ? 'Level cleared; result saved locally' : 'Reach 80% accuracy to level up');
  };

  const handleType = (value: string) => {
    if (result || remaining === 0 || isChallenge) return;
    if (!startedAt) setStartedAt(Date.now());
    setTyped(value);
  };

  const spawnChallengeChar = () => {
    const next = challengeChars[Math.floor(Math.random() * challengeChars.length)];
    setFallingChar(next);
    setFallProgress(0);
  };

  const startChallenge = () => {
    setGameScore(0);
    setLives(3);
    setGameEnded(false);
    setChallengeStarted(true);
    setGameMessage(`Level ${level} challenge started — type ${CHALLENGE_TARGET} falling characters.`);
    spawnChallengeChar();
  };

  useEffect(() => {
    if (!isChallenge || !challengeStarted || gameEnded) return;
    const step = level >= 10 ? 3 : 2;
    const timer = window.setInterval(() => {
      setFallProgress(prev => {
        const next = prev + step;
        if (next >= 100) {
          setLives(current => {
            const left = current - 1;
            if (left <= 0) {
              setGameEnded(true);
              setChallengeStarted(false);
              setGameMessage('Challenge failed — the character reached the valley. Retry when ready.');
              return 0;
            }
            setGameMessage(`Too slow — ${left} ${left === 1 ? 'life' : 'lives'} left.`);
            window.setTimeout(spawnChallengeChar, 0);
            return left;
          });
          return 0;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [isChallenge, challengeStarted, gameEnded, level]);

  useEffect(() => {
    if (!isChallenge || !challengeStarted || gameEnded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.length !== 1) return;
      if (event.key.toLowerCase() !== fallingChar.toLowerCase()) {
        setGameMessage(`Wrong key — catch “${fallingChar.toUpperCase()}” before it falls!`);
        return;
      }
      const nextScore = gameScore + 1;
      setGameScore(nextScore);
      if (nextScore >= CHALLENGE_TARGET) {
        setGameEnded(true);
        setChallengeStarted(false);
        setGameMessage(`Level ${level} challenge cleared! Advancing to Level ${level + 1}.`);
        setLevel(prev => prev + 1);
        return;
      }
      setGameMessage(`Nice catch! ${CHALLENGE_TARGET - nextScore} remaining.`);
      spawnChallengeChar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isChallenge, challengeStarted, gameEnded, fallingChar, gameScore, level]);

  return <main className="app-shell">
    <header>
      <div><span className="eyebrow">LEO DEVELOPMENT LAB</span><h1>Typing Tool</h1><p>Speed, accuracy, rhythm — now with level challenges.</p></div>
      <div className="live-badge">FREE ONLY</div>
    </header>

    <section className="profile-panel panel">
      <div><span className="eyebrow">ONLINE PROFILE</span><h2>Choose your nickname</h2><p>{profileStatus}</p></div>
      <div className="profile-actions"><input value={nickname} maxLength={24} onChange={e => setNickname(e.target.value)} placeholder="Your nickname" /><button onClick={syncProfile}>Sync Profile</button></div>
    </section>

    <section className={`level-panel panel ${isChallenge ? 'challenge-ready' : ''}`}>
      <div><span className="eyebrow">LEVEL CAMPAIGN</span><h2>Level {level}</h2><p>{isChallenge ? `Special mountain challenge unlocked at Level ${level}.` : `Complete a test with at least 80% accuracy. Next game challenge: Level ${nextChallenge}.`}</p></div>
      <div className="level-route">{[1,2,3,4,5,6,7,8,9,10].map(n => <span key={n} className={n === level ? 'current' : n < level ? 'cleared' : n === 5 || n === 10 ? 'boss' : ''}>{n}</span>)}</div>
    </section>

    {!isChallenge && <>
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
        {result && <div className="result-banner">Finished — {result.wpm} WPM · {result.accuracy}% accuracy {result.accuracy >= 80 ? '· LEVEL CLEARED' : '· 80% needed to level up'}</div>}
      </section>
    </>}

    {isChallenge && <section className="mountain-game panel">
      <div className="game-head"><div><span className="eyebrow">MOUNTAIN FALL CHALLENGE</span><h2>Level {level} Boss Game</h2><p>{gameMessage}</p></div><div className="game-stats"><span>Score <strong>{gameScore}/{CHALLENGE_TARGET}</strong></span><span>Lives <strong>{'♥'.repeat(lives)}{'♡'.repeat(Math.max(0, 3-lives))}</strong></span></div></div>
      <div className="mountain-stage" tabIndex={0}>
        <div className="moon" />
        <div className="mountain mountain-back" />
        <div className="mountain mountain-front" />
        <div className="snow-cap" />
        <div className="valley-line">VALLEY</div>
        {(challengeStarted || gameEnded) && <div className="falling-character" style={{ top: `${8 + Math.min(82, fallProgress * .82)}%` }}>{fallingChar.toUpperCase()}</div>}
        {!challengeStarted && !gameEnded && <div className="game-overlay"><strong>Ready?</strong><span>A character will fall from the mountain. Press that key before it reaches the valley.</span><button onClick={startChallenge}>Start Level {level}</button></div>}
        {gameEnded && <div className="game-overlay"><strong>{lives > 0 ? 'Challenge cleared!' : 'Try again'}</strong><span>{gameMessage}</span>{lives === 0 && <button onClick={startChallenge}>Retry Level {level}</button>}</div>}
      </div>
      <div className="game-tip">Keyboard controls only · Level {level >= 10 ? '10+' : '5'} speed · every 5th level is a game challenge</div>
    </section>}

    <section className="insights-grid">
      <div className="panel insights-card">
        <div className="section-title"><div><span className="eyebrow">PERSONAL STATS</span><h2>{nickname.trim() || 'Your'} progress</h2></div><button className="ghost" onClick={() => setHistory([])}>Clear local view</button></div>
        <div className="mini-stats"><div><span>BEST WPM</span><strong>{best?.wpm ?? 0}</strong></div><div><span>AVG WPM</span><strong>{averageWpm}</strong></div><div><span>AVG ACCURACY</span><strong>{averageAccuracy}%</strong></div><div><span>TESTS</span><strong>{history.length}</strong></div></div>
        <div className="history-list">{history.length === 0 ? <p className="empty">Complete a test to build your history.</p> : history.slice(0, 8).map(item => <div className="history-row" key={item.id}><div><strong>{item.wpm} WPM</strong><span>{item.accuracy}% accuracy · {item.mistakes} mistakes</span></div><div className="history-meta"><span>{item.difficulty}</span><span>{item.duration}s</span></div></div>)}</div>
      </div>

      <div className="panel insights-card">
        <span className="eyebrow">ONLINE LEADERBOARD</span><h2>Top runs</h2>
        <div className="leaderboard">{leaderboard.length === 0 ? <p className="empty">No online scores yet.</p> : leaderboard.map((item, index) => <div className="leader-row" key={item.id}><span className="rank">#{index + 1}</span><div><strong>{item.nickname || 'Player'} · {item.wpm} WPM</strong><span>{item.accuracy}% accuracy</span></div><div className="score-mode">{item.difficulty} · {item.duration}s</div></div>)}</div>
      </div>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
