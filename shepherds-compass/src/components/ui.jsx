// Shared UI building blocks

export function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '20px',
      cursor: onClick ? 'pointer' : 'default',
      transition: onClick ? 'border-color 0.2s, box-shadow 0.2s' : 'none',
      ...style,
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--gold-dim)'; }}}
    onMouseLeave={e => { if (onClick) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}}
    >
      {children}
    </div>
  );
}

export function Badge({ children, color = 'var(--text2)', bg }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 500,
      color, background: bg || color + '22',
    }}>
      {children}
    </span>
  );
}

export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, style = {}, type = 'button' }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    borderRadius: 8, fontWeight: 500, transition: 'all 0.15s',
    padding: size === 'sm' ? '6px 14px' : '10px 20px',
    fontSize: size === 'sm' ? 12 : 13,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    ...style,
  };
  const variants = {
    primary: { background: 'var(--gold)', color: '#0b0f14' },
    secondary: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' },
    danger: { background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)' },
    ghost: { background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)' },
  };
  return <button type={type} onClick={!disabled ? onClick : undefined} style={{ ...base, ...variants[variant] }}>{children}</button>;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 'clamp(20px, 5vw, 28px)', fontWeight: 700, lineHeight: 1.1 }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--text2)', marginTop: 4, fontSize: 13 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

export function StatBox({ label, value, color = 'var(--gold)', icon }) {
  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {icon && <div style={{ width: 44, height: 44, borderRadius: 12, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>{icon}</div>}
      <div>
        <div style={{ fontSize: 28, fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>{label}</div>
      </div>
    </Card>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
      padding: 0,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: '14px 14px 0 0', width: '100%', maxWidth: 560, maxHeight: '90vh',
        overflowY: 'auto', padding: 'clamp(16px, 4vw, 28px)',
        boxShadow: '0 -10px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--text2)', fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormField({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6, fontWeight: 500 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

export function EmptyState({ message, icon }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
      {icon && <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>}
      <p>{message}</p>
    </div>
  );
}

export function Loader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '2px solid var(--border)', borderTopColor: 'var(--gold)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function GoodBadBetter({ good, bad, better }) {
  if (!good && !bad && !better) return null;
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      {good && <div style={{ background: 'var(--green-dim)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginBottom: 4 }}>✓ WHAT'S GOOD</div>
        <p style={{ fontSize: 13, color: 'var(--text)' }}>{good}</p>
      </div>}
      {better && <div style={{ background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600, marginBottom: 4 }}>⟳ CAN BE BETTER</div>
        <p style={{ fontSize: 13, color: 'var(--text)' }}>{better}</p>
      </div>}
      {bad && <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginBottom: 4 }}>✗ NEEDS ATTENTION</div>
        <p style={{ fontSize: 13, color: 'var(--text)' }}>{bad}</p>
      </div>}
    </div>
  );
}