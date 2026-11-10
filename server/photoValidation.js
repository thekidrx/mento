const MAX_CAPTION_LENGTH = 200;

// Strict on purpose: Buffer.from(x, 'base64') silently skips characters it
// does not recognise, so a "data:" prefix or stray text would decode to a
// corrupt file instead of being refused.
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// Returns { buffer } or { problem: 'invalid' | 'too_large' }.
function decodeJpeg(value, maxBytes) {
  if (typeof value !== 'string' || value.length === 0) return { problem: 'invalid' };
  // Checked before decoding so an oversized string is not decoded just to be refused.
  if ((value.length * 3) / 4 > maxBytes + 2) return { problem: 'too_large' };
  if (value.length % 4 !== 0 || !BASE64.test(value)) return { problem: 'invalid' };

  const buffer = Buffer.from(value, 'base64');
  const isJpeg =
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (!isJpeg) return { problem: 'invalid' };
  if (buffer.length > maxBytes) return { problem: 'too_large' };
  return { buffer };
}

// A real YYYY-MM-DD date no later than tomorrow in UTC. The extra day covers
// someone whose local "today" is already the next day in UTC.
function isValidTakenOn(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== value) return false;
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return value <= tomorrow;
}

// Returns { value } (null when there is no caption) or { problem: 'invalid' | 'too_long' }.
function cleanCaption(value) {
  if (value === undefined || value === null) return { value: null };
  if (typeof value !== 'string') return { problem: 'invalid' };
  const trimmed = value.trim();
  if (trimmed.length > MAX_CAPTION_LENGTH) return { problem: 'too_long' };
  return { value: trimmed || null };
}

module.exports = { decodeJpeg, isValidTakenOn, cleanCaption, MAX_CAPTION_LENGTH };
