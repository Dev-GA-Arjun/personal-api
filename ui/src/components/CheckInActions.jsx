const choices = [
  { status: 'done', label: 'Done', className: 'button--primary' },
  { status: 'minimum', label: 'Minimum', className: 'button--quiet' },
  { status: 'skip', label: 'Skip', className: 'button--quiet' }
];

export default function CheckInActions({ disabled, pending, onLog, note, onNoteChange }) {
  return (
    <>
      <div className="action-row" aria-label="Log this check-in">
        {choices.map(({ status, label, className }) => (
          <button
            className={`button ${className}`}
            disabled={disabled || pending}
            key={status}
            onClick={() => onLog(status)}
            type="button"
          >
            {pending === status ? 'Saving…' : label}
          </button>
        ))}
      </div>
      <details className="note-disclosure">
        <summary>Add a note <span>optional</span></summary>
        <textarea
          aria-label="Optional check-in note"
          maxLength={280}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="One short line, if useful."
          value={note}
        />
      </details>
    </>
  );
}
