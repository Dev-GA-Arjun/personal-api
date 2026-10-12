import { useCallback, useEffect, useState } from 'react';
import { requestJson } from '../api.js';

export default function SettingsPage({ token, onUnauthorized }) {
  const [checkIns, setCheckIns] = useState(null);
  const [savedCheckIns, setSavedCheckIns] = useState(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await requestJson('/api/settings', token);
      setCheckIns(data.checkIns);
      setSavedCheckIns(data.checkIns);
    } catch (loadError) {
      onUnauthorized(loadError);
      setError(loadError.message);
    }
  }, [onUnauthorized, token]);

  useEffect(() => {
    load();
  }, [load]);

  function changeTime(index, value) {
    setCheckIns((current) => current.map((time, position) => position === index ? value : time));
    setFeedback('');
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const data = await requestJson('/api/settings', token, {
        method: 'PUT',
        body: JSON.stringify({ checkIns })
      });
      setCheckIns(data.checkIns);
      setSavedCheckIns(data.checkIns);
      setFeedback('Check-in times saved.');
    } catch (saveError) {
      onUnauthorized(saveError);
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  const changed = checkIns && savedCheckIns
    && checkIns.some((time, index) => time !== savedCheckIns[index]);

  return (
    <section className="page" aria-labelledby="page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR DAILY RHYTHM</p>
          <h1 id="page-title">Settings<span className="signal-period">.</span></h1>
        </div>
      </div>
      <p className="section-intro">
        Adjust when each reminder arrives. Tasks keep their current order, and past daily notes are left unchanged.
      </p>
      {error && <div className="inline-error" role="alert">{error}<button className="text-button" onClick={load} type="button">Retry</button></div>}
      {!checkIns && !error && <div className="loading-line" role="status">Loading settings…</div>}
      {checkIns && (
        <form className="settings-form" onSubmit={save}>
          <ol className="settings-list">
            {checkIns.map((time, index) => (
              <li className="settings-row" key={index}>
                <label className="settings-row__label" htmlFor={`check-in-${index}`}>
                  <span className="window-row__index">{String(index + 1).padStart(2, '0')}</span>
                  <span>Check-in {index + 1}</span>
                </label>
                <input
                  id={`check-in-${index}`}
                  aria-label={`Check-in ${index + 1} time`}
                  onChange={(event) => changeTime(index, event.target.value)}
                  required
                  step="60"
                  type="time"
                  value={time}
                />
              </li>
            ))}
          </ol>
          <div className="settings-form__actions">
            <button className="button button--primary" disabled={!changed || saving} type="submit">
              {saving ? 'Saving…' : 'Save times'}
            </button>
            {feedback && <p className="inline-success" role="status">{feedback}</p>}
          </div>
        </form>
      )}
    </section>
  );
}
