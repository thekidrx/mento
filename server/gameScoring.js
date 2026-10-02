function computeScoreTally(days, userAId, userBId) {
  const tally = { [userAId]: 0, [userBId]: 0 };
  for (const day of days) {
    const a = day.counts[userAId];
    const b = day.counts[userBId];
    if (a < b) tally[userAId] += 1;
    else if (b < a) tally[userBId] += 1;
  }
  return tally;
}

module.exports = { computeScoreTally };
