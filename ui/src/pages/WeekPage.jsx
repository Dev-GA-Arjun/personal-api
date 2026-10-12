import { useCallback, useEffect, useState } from 'react';
import { requestJson } from '../api.js';

const dayLabels = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday'
};

export default function WeekPage({ token, onUnauthorized }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await requestJson('/api/week', token));
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
          <p className="eyebrow">THE WEEK IN VIEW</p>
          <h1 id="page-title">Week<span className="signal-period">.</span></h1>
        </div>
      </div>
      {error && <div className="inline-error" role="alert">{error}<button className="text-button" onClick={load} type="button">Retry</button></div>}
      {!data && !error && <div className="loading-line" role="status">Loading this week…</div>}
      {data && (
        <>
          <div className="week-summary">
            <p className="eyebrow">THIS WEEK'S THEME</p>
            <h2>{data.theme}</h2>
          </div>
          <div className="consistency">
            <span className="consistency__count">{data.consistency.completedDays}<span> / {data.consistency.totalDays}</span></span>
            <span className="consistency__label">days with a completed check-in</span>
          </div>
          <ol className="day-list">
            {data.days.map(({ day, focus }, index) => (
              <li className="day-row" key={day}>
                <span className="window-row__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="day-row__name">{dayLabels[day] || day}</span>
                <span className="day-row__focus">{focus}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
