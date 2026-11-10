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
