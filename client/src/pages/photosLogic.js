import { toDateKey } from '../components/monthGridLogic';

export const MAX_BATCH = 20;
export const PHOTO_MAX_SIDE = 2000;
export const THUMB_MAX_SIDE = 480;
export const PHOTO_QUALITY = 0.85;
export const THUMB_QUALITY = 0.75;

// Spelled out rather than taken from the browser's locale, so headings read
// the same on every device.
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Photos arrive newest first; this only cuts that list into months.
export function groupByMonth(photos) {
  const groups = [];
  for (const photo of photos) {
    const key = photo.taken_on.slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const [year, month] = key.split('-').map(Number);
      group = { key, label: `${MONTH_NAMES[month - 1]} ${year}`, photos: [] };
      groups.push(group);
    }
    group.photos.push(photo);
  }
  return groups;
}

// Fits width×height inside maxSide on its longer edge. Never enlarges.
export function scaledSize(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// The date to suggest for a file: its own date, but never in the future.
export function defaultTakenOn(lastModifiedMs, now = new Date()) {
  const today = toDateKey(now);
  if (!lastModifiedMs || Number.isNaN(lastModifiedMs)) return today;
  const fileDay = toDateKey(new Date(lastModifiedMs));
  return fileDay > today ? today : fileDay;
}

// A real YYYY-MM-DD date that is today or earlier, in local time.
export function isUsableDate(dateKey, now = new Date()) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (toDateKey(date) !== dateKey) return false;
  return dateKey <= toDateKey(now);
}

// "Saturday, November 14, 2026" from a YYYY-MM-DD key, read as a local date
// (new Date('2026-11-14') would be UTC and can land on the day before).
export function formatLongDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date(year, month - 1, day).getDay()
  ];
  return `${weekday}, ${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}
