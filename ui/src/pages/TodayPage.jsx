import { useCallback, useEffect, useState } from 'react';
import { requestJson } from '../api.js';

const statusCopy = {
  done: 'Done',
  minimum: 'Minimum',
  skip: 'Skipped',
  no_data: 'No log'
};

export default function TodayPage({ token, onUnauthorized }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await requestJson('/api/today', token));
    } catch (loadError) {
      onUnauthorized(loadError);
      setError(loadError.message);
    }
  }, [onUnauthorized, token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="page" aria-labelledby="page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">FIVE MOMENTS, ONE DAY</p>
          <h1 id="page-title">Today<span className="signal-period">.</span></h1>
        </div>
        <button className="text-button refresh-button" onClick={load} type="button">Refresh</button>
      </div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {!data && !error && <div className="loading-line" role="status">Loading today…</div>}
      {data && (
        <>
          <p className="section-intro">{data.date} <span>·</span> Each window stands on its own.</p>
          <ol className="window-list">
            {data.windows.map((item, index) => (
              <li className="window-row" key={item.time}>
                <span className="window-row__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="window-row__time">{item.time}</span>
                <div className="window-row__task">
                  <span>{item.task}</span>
                  {item.minimumOnly && <span className="row-note">Minimum version today</span>}
                </div>
                <span className={`status-label status-label--${item.status || 'no_data'}`}>
                  {statusCopy[item.status] || statusCopy.no_data}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
