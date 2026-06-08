import { useState } from 'react';
import { checkDuplicateName } from '../checkDuplicate';

/**
 * A name input that automatically checks for duplicates on blur.
 * Shows a warning if similar names exist across sheep, first_timers, shepherds.
 * Non-blocking — user can still save.
 */
export default function DuplicateNameField({ value, onChange, excludeId, autoFocus, label = 'Full Name *' }) {
  const [duplicates, setDuplicates] = useState([]);
  const [checked, setChecked] = useState(false);

  async function handleBlur(e) {
    const name = e.target.value.trim();
    if (!name || name.length < 2) return;
    const dupes = await checkDuplicateName(name, excludeId);
    setDuplicates(dupes);
    setChecked(true);
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 11, textTransform: 'uppercase',
        letterSpacing: '0.8px', color: 'var(--text3)', marginBottom: 5,
      }}>
        {label}
      </label>

      <input
        value={value}
        autoFocus={autoFocus}
        onChange={e => {
          onChange(e.target.value);
          setChecked(false);
          setDuplicates([]);
        }}
        onBlur={handleBlur}
        style={{ width: '100%' }}
        placeholder="Full name"
      />

      {/* Duplicate warning */}
      {checked && duplicates.length > 0 && (
        <div style={{
          marginTop: 8,
          background: 'rgba(230,160,50,0.10)',
          border: '1px solid var(--amber, #e6a032)',
          borderRadius: 8,
          padding: '10px 12px',
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)', marginBottom: 6 }}>
            ⚠️ Similar name{duplicates.length > 1 ? 's' : ''} already in the system:
          </p>
          {duplicates.map(d => (
            <div key={d.id} style={{
              fontSize: 12, color: 'var(--text2)', padding: '4px 0',
              borderBottom: '1px solid rgba(230,160,50,0.15)',
              display: 'flex', justifyContent: 'space-between', gap: 12,
            }}>
              <span>
                <strong>{d.name}</strong>
                {d.phone ? <span style={{ color: 'var(--text3)' }}> · {d.phone}</span> : ''}
              </span>
              <span style={{ color: 'var(--text3)', flexShrink: 0 }}>{d.extra}</span>
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
            This is a warning only — you can still save if this is a different person.
          </p>
        </div>
      )}

      {/* All clear */}
      {checked && duplicates.length === 0 && (
        <p style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>
          ✓ No duplicates found
        </p>
      )}
    </div>
  );
}
