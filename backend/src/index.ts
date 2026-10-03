export type Difficulty = 'easy' | 'medium' | 'hard';

export type TypingResult = {
  durationSec: number;
  typedCharacters: number;
  correctCharacters: number;
  mistakes: number;
  accuracy: number;
  wpm: number;
};

const texts: Record<Difficulty, string[]> = {
  easy: [
    'The quick brown fox jumps over the lazy dog and runs across the quiet field.',
    'Learning to type well takes practice, patience, and a steady rhythm each day.'
  ],
  medium: [
    'System administrators monitor services, review alerts, and resolve incidents before users are affected.',
    'Cloud platforms make deployment faster, but reliable operations still depend on testing and observability.'
  ],
  hard: [
    'Security engineering requires precise configuration, disciplined change control, and continuous validation of identity, network, and application boundaries.',
    'Enterprise systems often depend on complex integrations where authentication, availability, logging, and recovery procedures must work together consistently.'
  ]
};

export function getTypingText(difficulty: Difficulty = 'medium'): string {
  const pool = texts[difficulty];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function scoreTyping(target: string, typed: string, durationSec: number): TypingResult {
  const typedCharacters = typed.length;
  let correctCharacters = 0;
  for (let i = 0; i < typed.length; i += 1) {
    if (typed[i] === target[i]) correctCharacters += 1;
  }
  const mistakes = Math.max(0, typedCharacters - correctCharacters);
  const accuracy = typedCharacters === 0 ? 100 : (correctCharacters / typedCharacters) * 100;
  const minutes = Math.max(durationSec / 60, 1 / 60);
  const wpm = (correctCharacters / 5) / minutes;

  return {
    durationSec,
    typedCharacters,
    correctCharacters,
    mistakes,
    accuracy: Number(accuracy.toFixed(1)),
    wpm: Number(wpm.toFixed(1))
  };
}
