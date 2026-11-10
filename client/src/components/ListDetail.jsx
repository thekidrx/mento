import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { missingKind, splitItems } from '../pages/listsLogic';
import { ArrowLeftIcon, CheckIcon, PencilIcon, TrashIcon } from './Icons';
import { useRefreshOnVisible } from './useRefreshOnVisible';

function deleteQuestion(itemCount) {
  if (itemCount === 0) return 'Delete this list?';
  if (itemCount === 1) return 'Delete this list and its 1 item?';
  return `Delete this list and its ${itemCount} items?`;
}

export function ListDetail({ listId, onBack }) {
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const addInput = useRef(null);
  // A ref, not state: two clicks in the same tick both see the old state.
  const adding = useRef(false);

  const deleting = useRef(false);

  // keepError: set when reloading right after a failed action, so the
  // reload does not wipe the message explaining what went wrong.
  async function loadList({ keepError = false } = {}) {
    try {
      setList(await api.getList(listId));
      if (!keepError) setError('');
      return true;
    } catch (err) {
      if (missingKind(err) === 'list') {
        onBack('That list was deleted.');
      } else {
        setError(err.message);
      }
      return false;
    }
  }

  useEffect(() => {
    loadList();
  }, [listId]);

  useRefreshOnVisible(() => loadList());

  // Runs one change, then reloads so the page always matches the server.
  async function run(action) {
    setError('');
    try {
      await action();
      await loadList();
      return true;
    } catch (err) {
      const missing = missingKind(err);
      if (missing === 'list') {
        onBack('That list was deleted.');
        return false;
      }
      if (missing === 'item') {
        // Already removed (a second tap, or the other person got there
        // first). Reloading shows the truth; there is nothing to report.
        await loadList();
        return false;
      }
      setError(err.message);
      await loadList({ keepError: true });
      return false;
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (adding.current) return;
    adding.current = true;
    setSubmitting(true);
    const ok = await run(() => api.addListItem(listId, text));
    adding.current = false;
    setSubmitting(false);
    if (ok) {
      setText('');
      if (addInput.current) addInput.current.focus();
    }
  }

  async function handleRename(e) {
    e.preventDefault();
    const ok = await run(() => api.renameList(listId, draftName));
    if (ok) setRenaming(false);
  }

  async function handleDeleteList() {
    if (deleting.current) return;
    deleting.current = true;
    setError('');
    try {
      await api.deleteList(listId);
      onBack();
    } catch (err) {
      if (missingKind(err) === 'list') {
        // Gone already, which is what was asked for.
        onBack();
      } else {
        deleting.current = false;
        setError(err.message);
      }
    }
  }

  if (!list) {
    return (
      <div className="lists-page">
        <button type="button" className="list-back" onClick={() => onBack()}>
          <ArrowLeftIcon size={18} />
          <span>Back to lists</span>
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    );
  }

  const { open, done } = splitItems(list.items);

  function renderItem(item) {
    const checked = Boolean(item.checked_at);
    return (
      <li key={item.id} className={`list-item${checked ? ' done' : ''}`}>
        <label className="list-item-main">
          <input
            type="checkbox"
            className="sr-only"
            checked={checked}
            onChange={() => run(() => api.setListItemChecked(listId, item.id, !checked))}
          />
          <span className="list-check" aria-hidden="true">
            {checked && <CheckIcon size={16} />}
          </span>
          <span className="list-item-body">
            <span className="list-item-text">{item.text}</span>
            {checked && item.checked_by_name && (
              <span className="list-item-by">checked by {item.checked_by_name}</span>
            )}
          </span>
        </label>
        <button
          type="button"
          className="icon-btn danger"
          aria-label={`Delete ${item.text}`}
          onClick={() => run(() => api.deleteListItem(listId, item.id))}
        >
          <TrashIcon size={16} />
        </button>
      </li>
    );
  }

  return (
    <div className="lists-page">
      <button type="button" className="list-back" onClick={() => onBack()}>
        <ArrowLeftIcon size={18} />
        <span>Back to lists</span>
      </button>

      {renaming ? (
        <form className="list-rename" onSubmit={handleRename}>
          <label className="sr-only" htmlFor="list-rename-input">List name</label>
          <input
            id="list-rename-input"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={60}
            required
            autoFocus
          />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" className="btn btn-ghost" onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="list-header">
          <h1 className="page-title list-title">{list.name}</h1>
          <button
            type="button"
            className="icon-btn"
            aria-label="Rename list"
            onClick={() => {
              setDraftName(list.name);
              setConfirmingDelete(false);
              setRenaming(true);
            }}
          >
            <PencilIcon size={18} />
          </button>
          <button
            type="button"
            className="icon-btn danger"
            aria-label="Delete list"
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon size={18} />
          </button>
        </div>
      )}

      {confirmingDelete && (
        <div className="list-confirm card" role="alertdialog" aria-label="Delete list">
          <p>{deleteQuestion(list.items.length)}</p>
          <div className="form-actions">
            <button type="button" className="btn btn-danger" onClick={handleDeleteList}>
              Delete
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <form className="list-create card" onSubmit={handleAdd}>
        <label className="sr-only" htmlFor="new-item-text">New item</label>
        <input
          id="new-item-text"
          ref={addInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add an item…"
          maxLength={200}
          required
        />
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          Add
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      {list.items.length === 0 ? (
        <p className="muted list-empty">Nothing here yet. Add the first item above.</p>
      ) : (
        <ul className="list-items card">
          {open.map(renderItem)}
          {done.map(renderItem)}
        </ul>
      )}

      {done.length > 0 && (
        <button
          type="button"
          className="btn btn-soft list-clear"
          onClick={() => run(() => api.clearCheckedItems(listId))}
        >
          Clear checked ({done.length})
        </button>
      )}
    </div>
  );
}
