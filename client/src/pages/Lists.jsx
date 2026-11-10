import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { CuteCat } from '../components/CuteCat';
import { ListDetail } from '../components/ListDetail';
import { ChevronRightIcon } from '../components/Icons';
import { useRefreshOnVisible } from '../components/useRefreshOnVisible';
import { progressLabel } from './listsLogic';

export function ListsPage() {
  const [lists, setLists] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedListId, setSelectedListId] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // A ref, not state: two clicks in the same tick both see the old state.
  const creating = useRef(false);

  async function loadLists() {
    try {
      setLists(await api.getLists());
      setLoaded(true);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadLists();
  }, []);

  useRefreshOnVisible(() => {
    if (selectedListId === null) loadLists();
  });

  async function handleCreate(e) {
    e.preventDefault();
    if (creating.current) return;
    creating.current = true;
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      await api.createList(name);
      setName('');
      await loadLists();
    } catch (err) {
      setError(err.message);
    } finally {
      creating.current = false;
      setSubmitting(false);
    }
  }

  function handleBack(message) {
    setSelectedListId(null);
    setNotice(message || '');
    loadLists();
  }

  if (selectedListId !== null) {
    return <ListDetail listId={selectedListId} onBack={handleBack} />;
  }

  return (
    <div className="lists-page">
      <div className="page-heading">
        <h1 className="page-title">Lists</h1>
        <p className="page-subtitle">Things to do, buy and watch together.</p>
      </div>
      {notice && <p className="banner" role="status">{notice}</p>}
      <form className="list-create card" onSubmit={handleCreate}>
        <label className="sr-only" htmlFor="new-list-name">New list name</label>
        <input
          id="new-list-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Groceries, bucket list…"
          maxLength={60}
          required
        />
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          Create
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {loaded && lists.length === 0 && (
        <div className="empty-state card">
          <CuteCat className="empty-mascot" />
          <p className="empty-title">No lists yet</p>
          <p className="empty-text">Start one for groceries, date ideas or a bucket list.</p>
        </div>
      )}
      <ul className="list-cards">
        {lists.map((list) => (
          <li key={list.id}>
            <button
              type="button"
              className="list-card card"
              onClick={() => {
                setNotice('');
                setSelectedListId(list.id);
              }}
            >
              <span className="list-card-text">
                <span className="list-card-name">{list.name}</span>
                <span className="list-card-progress">
                  {progressLabel(list.item_count, list.checked_count)}
                </span>
              </span>
              <ChevronRightIcon size={18} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
