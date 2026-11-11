// Drawings for the spot-the-difference scenes. Every object is drawn in a
// box from -14 to 14 on both axes; SpotObject places, turns and scales it.

// Copied from server/spotPuzzle.js (PALETTE). Change both together.
const PALETTE = {
  pink: ['#f9c6d8', '#f08fb4', '#d6457f'],
  coral: ['#fbd0bd', '#f59e7a', '#dd6b42'],
  yellow: ['#fbeab0', '#f3cc54', '#d99a1c'],
  green: ['#cfe8d5', '#86c79a', '#3f8f5f'],
  blue: ['#c9e2f5', '#82b8e4', '#3b7fbf'],
  purple: ['#dfd0f2', '#b294e0', '#7c57bd'],
};

const INK = '#5c3a4a';
const CREAM = '#fffaf3';
const line = { stroke: INK, strokeWidth: 1.2, strokeLinejoin: 'round', strokeLinecap: 'round' };

// Evenly spaced positions between `from` and `to`, for stripes and dots.
function spread(count, from, to) {
  if (count === 1) return [(from + to) / 2];
  return Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
}

// Points around a circle, starting at the top.
function ring(count, radius, cx = 0, cy = 0) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
}

// The ball's stripes are clipped to its outline by a shape that SpotScene
// defines once per picture (id "spot-ball-clip").
const DRAW = {
  // ---------- Toy shelf ----------
  ball: ({ a, b, count }) => (
    <>
      <circle r="12" fill={a} {...line} />
      {spread(count, -8, 8).map((x) => (
        <rect key={x} x={x - 1.3} y="-13" width="2.6" height="26" fill={b} clipPath="url(#spot-ball-clip)" />
      ))}
      <circle r="12" fill="none" {...line} />
    </>
  ),
  block: ({ a, b }) => (
    <>
      <rect x="-11" y="-11" width="22" height="22" rx="3" fill={a} {...line} />
      <rect x="-5" y="-6" width="10" height="4" rx="1" fill={b} {...line} />
      <rect x="-5" y="2" width="4" height="5" rx="1" fill={b} {...line} />
    </>
  ),
  teddy: ({ a, b, detail }) => (
    <>
      <circle cx="-7" cy="-9" r="3.6" fill={a} {...line} />
      <circle cx="7" cy="-9" r="3.6" fill={a} {...line} />
      <ellipse cx="0" cy="6" rx="8.5" ry="7.5" fill={a} {...line} />
      <circle cx="0" cy="-4" r="8" fill={a} {...line} />
      <ellipse cx="0" cy="-2" rx="3.4" ry="2.6" fill={CREAM} {...line} />
      <circle cx="-3" cy="-6" r="0.9" fill={INK} />
      <circle cx="3" cy="-6" r="0.9" fill={INK} />
      <ellipse cx="0" cy="7" rx="4" ry="3.6" fill={b} {...line} />
      {detail && (
        <path d="M-5 2 L-1 4 L-5 6 Z M5 2 L1 4 L5 6 Z" fill={INK} stroke={INK} strokeWidth="0.6" strokeLinejoin="round" />
      )}
    </>
  ),
  robot: ({ a, b, count, detail }) => (
    <>
      {detail && (
        <>
          <line x1="0" y1="-10" x2="0" y2="-13" {...line} />
          <circle cx="0" cy="-13" r="1.4" fill={b} {...line} />
        </>
      )}
      <rect x="-7" y="-10" width="14" height="9" rx="2.5" fill={a} {...line} />
      <circle cx="-3" cy="-5.5" r="1.3" fill={CREAM} {...line} />
      <circle cx="3" cy="-5.5" r="1.3" fill={CREAM} {...line} />
      <rect x="-10" y="0" width="20" height="13" rx="2.5" fill={a} {...line} />
      {spread(count, -7, 7).map((x) => (
        <circle key={x} cx={x} cy="6.5" r="1.3" fill={b} stroke={INK} strokeWidth="0.7" />
      ))}
    </>
  ),
  book: ({ a, b, count }) => (
    <>
      <rect x="-9" y="-13" width="18" height="26" rx="2" fill={a} {...line} />
      {spread(count, -9, 9).map((y) => (
        <rect key={y} x="-6.5" y={y - 1} width="13" height="2" rx="0.8" fill={b} />
      ))}
    </>
  ),
  car: ({ a, b, detail }) => (
    <>
      <path d="M-13 5 L-13 0 Q-13 -2 -10 -2 L-7 -2 L-4 -8 L5 -8 L9 -2 L11 -2 Q13 -2 13 0 L13 5 Z" fill={a} {...line} />
      {detail && <path d="M-3 -6 L4 -6 L6.500 -2.500 L-4.800 -2.500 Z" fill={CREAM} {...line} />}
      <circle cx="-7" cy="6" r="3.6" fill={b} {...line} />
      <circle cx="7" cy="6" r="3.6" fill={b} {...line} />
    </>
  ),
  rocket: ({ a, b, count }) => (
    <>
      <path d="M-6 6 L-11 12 L-6 11 Z M6 6 L11 12 L6 11 Z" fill={b} {...line} />
      <path d="M0 -14 Q7 -7 6 11 L-6 11 Q-7 -7 0 -14 Z" fill={a} {...line} />
      {spread(count, -6.5, 7.5).map((y) => (
        <circle key={y} cx="0" cy={y} r="1.5" fill={CREAM} stroke={INK} strokeWidth="0.7" />
      ))}
    </>
  ),
  drum: ({ a, b, count }) => (
    <>
      <rect x="-11" y="-7" width="22" height="15" fill={a} {...line} />
      {spread(count, -8, 8).map((x) => (
        <rect key={x} x={x - 1} y="-6" width="2" height="13" fill={b} />
      ))}
      <ellipse cx="0" cy="8" rx="11" ry="3" fill={a} {...line} />
      <ellipse cx="0" cy="-7" rx="11" ry="3.4" fill={CREAM} {...line} />
    </>
  ),

  // ---------- Garden ----------
  flower: ({ a, b, count, detail }) => (
    <>
      <path d="M0 3 L0 13" {...line} stroke="#3f8f5f" strokeWidth="1.6" fill="none" />
      {ring(count, 6.2, 0, -4).map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r="3.4" fill={a} {...line} />
      ))}
      {detail && <circle cx="0" cy="-4" r="3" fill={b} {...line} />}
    </>
  ),
  tulip: ({ a, b }) => (
    <>
      <path d="M0 0 L0 13" stroke="#3f8f5f" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M0 9 Q-8 7 -8 0 Q-3 3 0 9 Z" fill={b} {...line} />
      <path d="M-6 -12 L-3 -8 L0 -12 L3 -8 L6 -12 Q8 -1 0 1 Q-8 -1 -6 -12 Z" fill={a} {...line} />
    </>
  ),
  mushroom: ({ a, b, count }) => (
    <>
      <path d="M-4 0 Q-5 11 -3 12 L3 12 Q5 11 4 0 Z" fill={CREAM} {...line} />
      <path d="M-13 1 Q-12 -12 0 -12 Q12 -12 13 1 Z" fill={a} {...line} />
      {spread(count, -8.5, 8.5).map((x, i) => (
        <circle key={x} cx={x} cy={i % 2 === 0 ? -3 : -7} r="1.6" fill={b} stroke={INK} strokeWidth="0.6" />
      ))}
    </>
  ),
  butterfly: ({ a, b, detail }) => (
    <>
      {detail && <path d="M0 -6 Q-2 -11 -5 -12 M0 -6 Q2 -11 5 -12" fill="none" {...line} />}
      <path d="M0 -3 Q-13 -14 -13 -3 Q-13 3 0 1 Z M0 -3 Q13 -14 13 -3 Q13 3 0 1 Z" fill={a} {...line} />
      <path d="M0 1 Q-10 3 -8 9 Q-4 12 0 4 Z M0 1 Q10 3 8 9 Q4 12 0 4 Z" fill={b} {...line} />
      <ellipse cx="0" cy="0" rx="1.5" ry="7" fill={INK} />
    </>
  ),
  snail: ({ a, b, detail }) => (
    <>
      {detail && (
        <>
          <path d="M9 0 L8 -6 M11.500 0 L13 -6" fill="none" {...line} />
          <circle cx="8" cy="-6.5" r="1" fill={INK} />
          <circle cx="13" cy="-6.5" r="1" fill={INK} />
        </>
      )}
      <path d="M-13 10 L8 10 Q13 10 13 4 Q13 -1 9 -1 Q6 -1 6 4 L6 7 L-13 7 Z" fill={b} {...line} />
      <circle cx="-3" cy="0" r="9" fill={a} {...line} />
      <path d="M-3 0 m-4.500 0 a4.500 4.500 0 1 1 4.500 4.500" fill="none" {...line} />
    </>
  ),
  ladybird: ({ a, b, count }) => (
    <>
      <ellipse cx="0" cy="2" rx="10" ry="11" fill={a} {...line} />
      <path d="M-7.500 -6 Q0 -15 7.500 -6 Q0 -3 -7.500 -6 Z" fill={INK} {...line} />
      <line x1="0" y1="-5" x2="0" y2="13" {...line} />
      {ring(count, 5.6, 0, 3.5).map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r="1.7" fill={b} stroke={INK} strokeWidth="0.6" />
      ))}
    </>
  ),
  leaf: ({ a, b }) => (
    <>
      <path d="M0 -13 Q12 -4 6 8 Q3 12 0 13 Q-3 12 -6 8 Q-12 -4 0 -13 Z" fill={a} {...line} />
      <path d="M0 -9 L0 11 M0 -2 L5 -6 M0 3 L-5 -1 M0 7 L4 3" fill="none" stroke={b} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  carrot: ({ a, b, count }) => (
    <>
      <path d="M-3 -8 Q-7 -14 -2 -13 Q0 -15 2 -13 Q7 -14 3 -8 Z" fill={b} {...line} />
      <path d="M-6 -8 L6 -8 Q5 6 0 14 Q-5 6 -6 -8 Z" fill={a} {...line} />
      {spread(count, -5, 8).map((y, i) => (
        <line key={y} x1={i % 2 === 0 ? -4 : 0} y1={y} x2={i % 2 === 0 ? 0 : 4} y2={y} stroke={INK} strokeWidth="1" strokeLinecap="round" />
      ))}
    </>
  ),

  // ---------- Picnic ----------
  cup: ({ a, b, detail }) => (
    <>
      {detail && <path d="M7 -3 Q14 -3 14 2 Q14 7 6 6" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />}
      {detail && <path d="M7 -3 Q14 -3 14 2 Q14 7 6 6" fill="none" stroke={b} strokeWidth="1.4" strokeLinecap="round" />}
      <path d="M-9 -8 L9 -8 L7 9 Q7 11 5 11 L-5 11 Q-7 11 -7 9 Z" fill={a} {...line} />
      <rect x="-8.300" y="-3" width="16.600" height="4" fill={b} />
      <path d="M-9 -8 L9 -8 L7 9 Q7 11 5 11 L-5 11 Q-7 11 -7 9 Z" fill="none" {...line} />
    </>
  ),
  teapot: ({ a, b, detail }) => (
    <>
      {detail && <circle cx="0" cy="-10" r="2.2" fill={b} {...line} />}
      <path d="M7 0 Q14 -6 13 -9" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M7 0 Q14 -6 13 -9" fill="none" stroke={a} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M-8 -2 Q-14 -2 -14 3 Q-14 8 -8 7" fill="none" {...line} strokeWidth="1.6" />
      <ellipse cx="0" cy="3" rx="10" ry="9" fill={a} {...line} />
      <path d="M-7 -4 Q0 -10 7 -4 Z" fill={b} {...line} />
    </>
  ),
  cupcake: ({ a, b, count, detail }) => (
    <>
      {detail && <circle cx="0" cy="-11" r="2.6" fill="#d6457f" {...line} />}
      <path d="M-11 1 Q-12 -6 -6 -6 Q-5 -11 0 -10 Q5 -11 6 -6 Q12 -6 11 1 Z" fill={a} {...line} />
      {spread(count, -7, 7).map((x, i) => (
        <rect key={x} x={x - 0.6} y={i % 2 === 0 ? -4 : -7} width="1.200" height="3" rx="0.6" fill={INK} />
      ))}
      <path d="M-9 1 L9 1 L6 13 L-6 13 Z" fill={b} {...line} />
    </>
  ),
  apple: ({ a, b, detail }) => (
    <>
      <path d="M0 -6 Q1 -11 3 -12" fill="none" {...line} />
      {detail && <path d="M2 -9 Q8 -13 10 -8 Q5 -6 2 -9 Z" fill={b} {...line} />}
      <path d="M0 -6 Q-12 -10 -12 1 Q-12 12 -4 12 Q0 11 0 11 Q0 11 4 12 Q12 12 12 1 Q12 -10 0 -6 Z" fill={a} {...line} />
    </>
  ),
  sandwich: ({ a, b }) => (
    <>
      <path d="M-13 9 L13 9 L0 -12 Z" fill={CREAM} {...line} />
      <path d="M-10.500 5 L10.500 5 L8 1 L-8 1 Z" fill={a} {...line} />
      <path d="M-7.500 0 L7.500 0 L5 -4 L-5 -4 Z" fill={b} {...line} />
    </>
  ),
  cheese: ({ a, b, count }) => (
    <>
      <path d="M-13 9 L13 9 L13 -2 L-13 9 Z" fill={a} {...line} />
      <path d="M-13 9 L13 -2 L7 -9 Z" fill={b} {...line} />
      {spread(count, -4, 10).map((x, i) => (
        <circle key={x} cx={x} cy={i % 2 === 0 ? 5.5 : 3} r="1.5" fill={CREAM} stroke={INK} strokeWidth="0.6" />
      ))}
    </>
  ),
  cookie: ({ a, b, count }) => (
    <>
      <circle r="12" fill={a} {...line} />
      {ring(count, 6.5).map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r="2" fill={b} stroke={INK} strokeWidth="0.6" />
      ))}
    </>
  ),
  bottle: ({ a, b, detail }) => (
    <>
      <rect x="-2.500" y="-14" width="5" height="4" rx="1" fill={INK} />
      <path d="M-2.500 -10 L2.500 -10 L2.500 -6 Q7 -4 7 0 L7 11 Q7 13 5 13 L-5 13 Q-7 13 -7 11 L-7 0 Q-7 -4 -2.500 -6 Z" fill={a} {...line} />
      {detail && <rect x="-7" y="1" width="14" height="7" fill={b} {...line} />}
    </>
  ),
};

export const SPOT_OBJECT_TYPES = Object.keys(DRAW);

export function SpotObject({ object }) {
  const draw = DRAW[object.type];
  if (!draw) return null;
  const [first, second] = object.colors;
  return (
    <g transform={`translate(${object.x} ${object.y}) rotate(${object.rotation}) scale(${object.size})`}>
      {draw({
        a: PALETTE[first.family][first.shade],
        b: PALETTE[second.family][second.shade],
        count: object.count,
        detail: object.detail,
      })}
    </g>
  );
}

const ROW_BOTTOMS = [60, 120, 180, 240, 300];

export function SpotBackground({ theme }) {
  if (theme === 'shelf') {
    return (
      <>
        <rect width="400" height="300" fill="#fbf3ea" />
        {ROW_BOTTOMS.map((y) => (
          <rect key={y} x="0" y={y - 5} width="400" height="5" fill="#e3c9ab" />
        ))}
      </>
    );
  }
  if (theme === 'garden') {
    return (
      <>
        <rect width="400" height="300" fill="#eaf5e6" />
        {ROW_BOTTOMS.map((y) => (
          <rect key={y} x="0" y={y - 7} width="400" height="7" rx="3" fill="#dcc7ad" />
        ))}
      </>
    );
  }
  // picnic
  const squares = [];
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      if ((row + col) % 2 === 0) {
        squares.push(<rect key={`${row}-${col}`} x={col * 25} y={row * 25} width="25" height="25" fill="#fde3ea" />);
      }
    }
  }
  return (
    <>
      <rect width="400" height="300" fill="#fff6f8" />
      {squares}
    </>
  );
}
