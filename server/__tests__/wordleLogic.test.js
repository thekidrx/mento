const { computeFeedback } = require('../wordleLogic');

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
