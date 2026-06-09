import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      setError('Invalid email or password. Please try again.');
    }
    // On success, AuthContext updates user → App redirects automatically
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo / branding */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))',
            border: '1px solid var(--gold)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28,
          }}>
            🐑
          </div>
          <h1 style={{
            fontSize: 28, fontFamily: 'Cormorant Garamond, serif',
            fontWeight: 700, color: 'var(--gold)', marginBottom: 6,
          }}>
            Shepherd's Compass
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>
            CIDC Budapest Branch
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '32px 28px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Sign in</h2>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>
            Enter your credentials to access the dashboard.
          </p>

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text3)', marginBottom: 6 }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                autoComplete="email"
                style={{ width: '100%' }}
                required
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text3)', marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  style={{ width: '100%', paddingRight: 44 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text3)', padding: 0,
                  }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
                background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#f87171',
              }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 9,
                background: loading || !email || !password ? 'var(--border)' : 'var(--gold)',
                color: loading || !email || !password ? 'var(--text3)' : '#0b0f14',
                border: 'none', cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.15s',
              }}
            >
              {loading ? (
                <>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #0b0f14', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Signing in…
                </>
              ) : (
                <><LogIn size={15} /> Sign In</>
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text3)' }}>
          Access is restricted to authorised administrators only.
        </p>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
