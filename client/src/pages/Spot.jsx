import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Scoreboard, ResultBanner } from '../components/Scoreboard';
import { SpotScene } from '../components/SpotScene';
import { useRefreshOnVisible } from '../components/useRefreshOnVisible';
import { formatCountdown, resultLine } from './spotLogic';

const OFFLINE_MESSAGE = "Couldn't reach the server. The clock is still running.";
const DOUBLE_TAP_MS = 250;
const FLASH_MS = 900;
const LOW_TIME_MS = 10000;

function seconds(ms) {
  return (Math.floor(ms / 100) / 10).toFixed(1);
}

export function SpotPage({ currentUserId }) {
  const [state, setState] = useState(null);
  const [score, setScore] = useState({});
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [flashes, setFlashes] = useState([]);
  const [, setTick] = useState(0);

  // When the current state arrived, for counting down between answers.
  const receivedAt = useRef(0);
  // Requests are numbered so an answer that arrives late cannot overwrite a
  // newer one.
  const requestCounter = useRef(0);
  const appliedRequest = useRef(0);
  const lastTapAt = useRef(0);
  const starting = useRef(false);
  const askedAtZero = useRef(false);
  const nextFlashId = useRef(1);
  const flashTimers = useRef(new Set());

  function applyState(next, requestId) {
    if (requestId < appliedRequest.current) return;
    appliedRequest.current = requestId;
    receivedAt.current = performance.now();
    askedAtZero.current = false;
    setState(next);
  }

  function loadScore() {
    api.getSpotScore().then(setScore).catch(() => {});
  }

  async function loadState() {
    const requestId = (requestCounter.current += 1);
    try {
      applyState(await api.getSpotToday(), requestId);
      setError('');
      return true;
    } catch (err) {
      // err.status is missing when the request never reached the server.
      if (state) setError(OFFLINE_MESSAGE);
      else setError(err.status ? err.message : "Couldn't reach the server. Try again in a moment.");
      return false;
    }
  }

  useEffect(() => {
    loadState();
    loadScore();
    api.getUsers().then(setUsers).catch(() => {});
    const timers = flashTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  // Coming back to the tab: a round may have run out, or the other person
  // may have played, while this page was in the background.
  useRefreshOnVisible(() => {
    loadState();
    loadScore();
  });

  const status = state ? state.status : null;

  // The scoreboard changes when a round ends.
  useEffect(() => {
    if (status === 'finished') loadScore();
  }, [status]);

  // Redraw the countdown ten times a second, only while a round is running.
  useEffect(() => {
    if (status !== 'playing') return undefined;
    const interval = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(interval);
  }, [status]);

  const remainingMs =
    status === 'playing'
      ? Math.max(0, state.remainingMs - (performance.now() - receivedAt.current))
      : 0;

  // The local clock has run out. The server decides whether the round is
  // really over; ask it once, and again only after another answer arrives.
  useEffect(() => {
    if (status === 'playing' && remainingMs === 0 && !askedAtZero.current) {
      askedAtZero.current = true;
      loadState();
    }
  });

  async function handleStart() {
    if (starting.current) return;
    starting.current = true;
    setError('');
    const requestId = (requestCounter.current += 1);
    try {
      applyState(await api.startSpot(), requestId);
    } catch {
      setError("Couldn't start the round. Nothing has been counted; try again.");
    } finally {
      starting.current = false;
    }
  }

  function showFlash(tap) {
    const id = nextFlashId.current;
    nextFlashId.current += 1;
    setFlashes((current) => [...current, { id, label: tap.label, x: tap.x, y: tap.y }]);
    const timer = setTimeout(() => {
      flashTimers.current.delete(timer);
      setFlashes((current) => current.filter((flash) => flash.id !== id));
    }, FLASH_MS);
    flashTimers.current.add(timer);
  }

  async function handleTap(tap) {
    // A double tap must not cost two penalties.
    const nowMs = performance.now();
    if (nowMs - lastTapAt.current < DOUBLE_TAP_MS) return;
    lastTapAt.current = nowMs;

    const requestId = (requestCounter.current += 1);
    try {
      const answer = await api.tapSpot(tap.x, tap.y);
      if (answer.result === 'miss') showFlash(tap);
      applyState(answer.state, requestId);
      setError('');
    } catch (err) {
      // "The round is over" is an answer, not a failure: it carries the
      // finished round.
      if (err.status === 409 && err.data && err.data.state) {
        applyState(err.data.state, requestId);
        setError('');
      } else {
        setError(OFFLINE_MESSAGE);
        // Lets the zero-clock check ask the server again.
        askedAtZero.current = false;
      }
    }
  }

  const self = users.find((u) => u.id === currentUserId);
  const opponent = users.find((u) => u.id !== currentUserId);
  const opponentName = opponent ? opponent.display_name : 'your partner';

  const heading = (
    <div className="page-heading">
      <h1 className="page-title">Spot it</h1>
      <p className="page-subtitle">Find the differences before the clock runs out.</p>
    </div>
  );

  if (!state) {
    return (
      <div className="spot-page game-page">
        {heading}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    );
  }

  if (status === 'not_started') {
    return (
      <div className="spot-page game-page">
        {heading}
        <div className="game-card card">
          <Scoreboard self={self} opponent={opponent} score={score} />
          <ul className="spot-rules">
            <li>{state.total} differences.</li>
            <li>{state.timeLimitMs / 1000} seconds.</li>
            <li>A wrong tap costs {state.penaltyMs / 1000} seconds.</li>
          </ul>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary btn-block" onClick={handleStart}>
            Start
          </button>
          {state.opponentFinished && (
            <p className="muted spot-note">{opponentName} has already played today.</p>
          )}
        </div>
      </div>
    );
  }

  const finished = status === 'finished';
  const marks = finished
    ? state.differences.map((d) => ({
        ...d,
        style: state.found.includes(d.index) ? 'found' : 'missed',
      }))
    : state.foundDifferences.map((d) => ({ ...d, style: 'found' }));

  const pictures = [
    { label: 'A', sceneObjects: state.sceneA },
    { label: 'B', sceneObjects: state.sceneB },
  ];

  return (
    <div className={`spot-page${finished ? '' : ' playing'}`}>
      {heading}
      {finished ? (
        <div className="spot-summary card">
          <Scoreboard self={self} opponent={opponent} score={score} />
          <p className="spot-result">
            {resultLine(state.yourResult.found, state.total, state.yourResult.timeMs)}
          </p>
          {!state.todayResult && (
            <ResultBanner>Waiting on {opponentName} to play today's puzzle.</ResultBanner>
          )}
          {state.todayResult && (
            <ResultBanner tone={state.todayResult.winner === 'you' ? 'win' : 'info'}>
              {state.todayResult.winner === 'tie' && "Today's puzzle was a tie."}
              {state.todayResult.winner === 'you' && 'You won today!'}
              {state.todayResult.winner === 'opponent' && `${opponentName} won today.`}{' '}
              {state.todayResult.opponentFound === 0
                ? `${opponentName} didn't find any.`
                : `${opponentName} found ${state.todayResult.opponentFound} of ${state.total} in ${seconds(
                    state.todayResult.opponentTimeMs
                  )}s.`}
            </ResultBanner>
          )}
        </div>
      ) : (
        <div className="spot-status" aria-live="off">
          <span className={`spot-clock${remainingMs < LOW_TIME_MS ? ' low' : ''}`}>
            {formatCountdown(remainingMs)}
          </span>
          <span className="spot-count">
            {state.found.length} of {state.total}
          </span>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className={`spot-pictures${finished ? ' finished' : ''}`}>
        {pictures.map((picture) => (
          <SpotScene
            key={picture.label}
            label={picture.label}
            theme={state.theme}
            sceneObjects={picture.sceneObjects}
            marks={marks}
            flashes={flashes.filter((flash) => flash.label === picture.label)}
            onTap={handleTap}
            disabled={finished}
          />
        ))}
      </div>
      {finished && (
        <p className="muted spot-legend">
          Solid rings are the ones you found. Dashed rings are the ones you missed.
        </p>
      )}
    </div>
  );
}
