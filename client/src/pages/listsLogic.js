export function progressLabel(itemCount, checkedCount) {
  if (itemCount === 0) return 'Nothing here yet';
  if (checkedCount === itemCount) return 'All done';
  return `${checkedCount} of ${itemCount} done`;
}

// The server already sorts items; this only separates the two groups.
export function splitItems(items) {
  return {
    open: items.filter((item) => !item.checked_at),
    done: items.filter((item) => item.checked_at),
  };
}

// Says what a failed request was aimed at when the server reports it gone
// (the other person can delete a list or item while it is on screen here).
export function missingKind(err) {
  if (err.status !== 404) return null;
  if (err.message === 'List not found') return 'list';
  if (err.message === 'Item not found') return 'item';
  return null;
}
