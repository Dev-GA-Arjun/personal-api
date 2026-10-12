import { useCallback, useEffect, useState } from 'react';
import { requestJson } from '../api.js';
import CheckInActions from '../components/CheckInActions.jsx';

function dateLabel(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

export default function NowPage({ token, onUnauthorized }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await requestJson('/api/now', token));
    } catch (loadError) {
      onUnauthorized(loadError);
      setError(loadError.message);
    }
  }, [onUnauthorized, token]);

  useEffect(() => {
    load();
  }, [load]);

  async function logStatus(status) {
    if (!data?.window || pending) return;

    setPending(status);
    setError('');
    setFeedback('');
    try {
      await requestJson('/api/log', token, {
        method: 'POST',
        body: JSON.stringify({ window: data.window, status, note: note.trim() })
      });
      setData((current) => ({ ...current, status }));
      setNote('');
      setFeedback(`${status === 'minimum' ? 'Minimum logged' : `${status[0].toUpperCase()}${status.slice(1)} logged`}.`);
    } catch (logError) {
      onUnauthorized(logError);
      setError(logError.message);
    } finally {
      setPending('');
    }
  }

  return (
    <section className="page page--now" aria-labelledby="page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CURRENT WINDOW</p>
          <h1 id="page-title">Now<span className="signal-period">.</span></h1>
        </div>
        <p className="date-stamp">{dateLabel(new Date())}</p>
      </div>

      {error && <div className="inline-error" role="alert">{error}<button className="text-button" onClick={load} type="button">Retry</button></div>}
      {!data && !error && <div className="loading-line" role="status">Loading your next check-in…</div>}
      {data?.window ? (
        <article className="current-task">
          <div className="current-task__meta">
            <span className="window-time">{data.window}</span>
            <span className={`status-label status-label--${data.status || 'no_data'}`}>{(data.status || 'no_data').replace('_', ' ')}</span>
          </div>
          <h2 className="task-title">{data.task}</h2>
          <div className="minimum-line">
            <span className="minimum-line__label">MINIMUM</span>
            <span>{data.minimumVersion}</span>
          </div>
          <CheckInActions
            disabled={!data.window}
            pending={pending}
            onLog={logStatus}
            note={note}
            onNoteChange={setNote}
          />
          {feedback && <p className="inline-success" role="status">{feedback}</p>}
        </article>
      ) : data ? (
        <div className="empty-state">
          <p className="eyebrow">BETWEEN WINDOWS</p>
          <h2>No active check-in.</h2>
          <p>Your next reminder will bring you back here.</p>
        </div>
      ) : null}
    </section>
  );
}
