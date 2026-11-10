// server/__tests__/photoValidation.test.js
const { decodeJpeg, isValidTakenOn, cleanCaption } = require('../photoValidation');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('body')]);
const b64 = JPEG.toString('base64');

describe('decodeJpeg', () => {
  it('decodes valid base64 JPEG data', () => {
    expect(decodeJpeg(b64, 1024).buffer.equals(JPEG)).toBe(true);
  });

  it.each([
    [undefined],
    [null],
    [42],
    [''],
    [{}],
    [`data:image/jpeg;base64,${b64}`],
    [`${b64.slice(0, 4)} ${b64.slice(4)}`],
    [`${b64.slice(0, 4)}\n${b64.slice(4)}`],
    [`${b64}!`],
    [Buffer.from('GIF89a not a jpeg').toString('base64')],
    [Buffer.from([0xff, 0xd8]).toString('base64')],
  ])('rejects %j as invalid', (value) => {
    expect(decodeJpeg(value, 1024)).toEqual({ problem: 'invalid' });
  });

  it('rejects data over the byte limit', () => {
    expect(decodeJpeg(b64, JPEG.length - 1)).toEqual({ problem: 'too_large' });
    expect(decodeJpeg(b64, JPEG.length).buffer).toBeDefined();
  });
});

describe('isValidTakenOn', () => {
  const now = new Date('2026-11-10T12:00:00Z');

  it.each(['2026-11-10', '2026-11-11', '2020-02-29', '1999-01-01'])('accepts %s', (d) => {
    expect(isValidTakenOn(d, now)).toBe(true);
  });

  it.each([
    ['2026-11-12'],
    ['2999-01-01'],
    ['2026-02-30'],
    ['2026-13-01'],
    ['2026-00-10'],
    ['2026-1-5'],
    ['11/10/2026'],
    [''],
    [null],
    [undefined],
    [20261110],
  ])('rejects %j', (d) => {
    expect(isValidTakenOn(d, now)).toBe(false);
  });
});

describe('cleanCaption', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    ['   ', null],
    [' Beach ', 'Beach'],
  ])('%j → %j', (input, value) => {
    expect(cleanCaption(input)).toEqual({ value });
  });

  it('accepts 200 characters and rejects 201', () => {
    expect(cleanCaption('a'.repeat(200))).toEqual({ value: 'a'.repeat(200) });
    expect(cleanCaption('a'.repeat(201))).toEqual({ problem: 'too_long' });
  });

  it.each([[42], [{}], [[]], [true]])('rejects non-string %j', (input) => {
    expect(cleanCaption(input)).toEqual({ problem: 'invalid' });
  });
});
