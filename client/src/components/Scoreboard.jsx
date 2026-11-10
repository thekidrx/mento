export function Scoreboard({ self, opponent, score }) {
  if (!self || !opponent) return null;
  const players = [
    { user: self, className: 'you', label: 'You' },
    { user: opponent, className: 'partner', label: null },
  ];
  return (
    <div className="scoreboard" aria-label="All-time score">
      {players.map(({ user, className, label }) => (
        <div key={user.id} className={`scoreboard-player ${className}`}>
          <span className="scoreboard-name">
            {user.display_name}
            {label && <span className="scoreboard-tag">{label}</span>}
          </span>
          <span className="scoreboard-points">{score[user.id] || 0}</span>
        </div>
      ))}
    </div>
  );
}

export function ResultBanner({ tone = 'info', children }) {
  return (
    <p className={`banner banner-${tone}`} role="status">
      {children}
    </p>
  );
}
