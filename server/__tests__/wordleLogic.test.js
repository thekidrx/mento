const { computeFeedback } = require('../wordleLogic');
const {
  loadAnswerWords,
  loadValidGuessSet,
  pickDailyWord,
  computeGuessCount,
} = require('../wordleLogic');

describe('computeFeedback', () => {
  it('marks every letter green on an exact match', () => {
    expect(computeFeedback('CRANE', 'CRANE')).toBe('GGGGG');
  });

  it('handles a guess and answer that share letters at different positions and counts', () => {
    // answer ERASE has two E's; guess SPEED has two E's and a D not in the answer.
    expect(computeFeedback('SPEED', 'ERASE')).toBe('YBYYB');
  });

  it('only marks a repeated guess letter yellow once when the answer has fewer copies', () => {
    // answer MODEL has one L; guess ALLOT has two L's, so only the first should be yellow.
    expect(computeFeedback('ALLOT', 'MODEL')).toBe('BYBYB');
  });
});

describe('loadAnswerWords', () => {
  it('loads a non-empty list of uppercase 5-letter words including a known common word', () => {
    const words = loadAnswerWords();
    expect(words.length).toBeGreaterThan(100);
    expect(words).toContain('ABOUT');
    expect(words.every((w) => /^[A-Z]{5}$/.test(w))).toBe(true);
  });
});

describe('loadValidGuessSet', () => {
  it('includes both answer words and the broader guess list', () => {
    const set = loadValidGuessSet();
    expect(set.has('ABOUT')).toBe(true);
    expect(set.has('AAHED')).toBe(true);
    expect(set.has('ZZZZZ')).toBe(false);
  });
});

describe('pickDailyWord', () => {
  it('excludes already-used words when an unused one remains', () => {
    const answers = ['ALPHA', 'BRAVO', 'CHARL'];
    const used = ['ALPHA', 'BRAVO'];
    expect(pickDailyWord(answers, used)).toBe('CHARL');
  });

  it('falls back to the full list once every word has been used', () => {
    const answers = ['ALPHA', 'BRAVO'];
    const used = ['ALPHA', 'BRAVO'];
    expect(answers).toContain(pickDailyWord(answers, used));
  });
});

describe('computeGuessCount', () => {
  it('returns null while still in progress', () => {
    expect(computeGuessCount([{ feedback: 'BBBBB' }, { feedback: 'YBBBB' }])).toBeNull();
  });

  it('returns the 1-based guess number on a solve', () => {
    expect(
      computeGuessCount([{ feedback: 'BBBBB' }, { feedback: 'GGGGG' }, { feedback: 'GGGGG' }])
    ).toBe(2);
  });

  it('returns Infinity after 6 guesses with no solve', () => {
    const guesses = new Array(6).fill({ feedback: 'BBBBB' });
    expect(computeGuessCount(guesses)).toBe(Infinity);
  });
});

