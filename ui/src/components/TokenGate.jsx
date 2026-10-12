import { useState } from 'react';

export default function TokenGate({ onUnlock, error }) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!value.trim() || pending) return;

    setPending(true);
    try {
      await onUnlock(value.trim());
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="gate">
      <div className="gate__mark" aria-hidden="true">R/</div>
      <p className="eyebrow">LOCAL ROUTINE · PRIVATE</p>
      <h1>Pick up where you left off.</h1>
      <p className="gate__copy">Enter your local API token to open your routine.</p>
      <form className="token-form" onSubmit={submit}>
        <label htmlFor="api-token">Bearer token</label>
        <input
          id="api-token"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby={error ? 'token-error' : 'token-hint'}
          aria-invalid={Boolean(error)}
          aria-required="true"
          required
        />
        <p
          className={error ? 'form-error field-hint' : 'field-hint'}
          id={error ? 'token-error' : 'token-hint'}
          role={error ? 'alert' : undefined}
        >
          {error || 'Kept in this tab only. It is not written into the page.'}
        </p>
        <button className="button button--primary token-form__submit" type="submit" disabled={pending || !value.trim()}>
          {pending ? 'Checking…' : 'Unlock routine'}
        </button>
      </form>
      <p className="gate__footnote">Runs on this device. No account, no cloud.</p>
    </main>
  );
}
