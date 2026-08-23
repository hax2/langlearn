import { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Auth.css';

export default function Auth({ onGuestMode }) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMsg(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) setError(error.message)
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async () => {
    setLoading(true)
    setError(null)
    setMsg(null)
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) setError(error.message)
      else setMsg('Account created. Check your email to confirm your address.')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to create your account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container animate-fade-in">
      <form className="auth-form glass-panel" onSubmit={handleLogin}>
        <div className="auth-heading">
          <span className="auth-eyebrow">Spanish practice, your pace</span>
          <h1>Welcome to LangLearn</h1>
          <p>Sign in to keep learning, or start the free course as a guest.</p>
        </div>

        {error && <div className="auth-error" role="alert">{error}</div>}
        {msg && <div className="auth-msg" role="status">{msg}</div>}

        <label className="auth-field" htmlFor="auth-email">
          <span>Email</span>
          <input
            id="auth-email"
            className="auth-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={loading}
            required
          />
        </label>
        <label className="auth-field" htmlFor="auth-password">
          <span>Password</span>
          <div className="auth-password">
            <input
              id="auth-password"
              className="auth-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
              minLength="6"
              required
            />
            <button
              className="btn-password-toggle"
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              disabled={loading}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        <div className="auth-button-group">
          <button
            className="btn-primary"
            type="submit"
            disabled={loading || !email || password.length < 6}
          >
            {loading ? 'Please wait…' : 'Sign in'}
          </button>
          <button
            className="btn-secondary"
            type="button"
            onClick={handleSignUp}
            disabled={loading || !email || password.length < 6}
          >
            Create account
          </button>
        </div>

        {onGuestMode && (
          <div className="auth-guest">
            <div className="auth-divider"><span>or</span></div>
            <button
              className="btn-guest"
              onClick={onGuestMode}
              type="button"
            >
              Continue as guest
            </button>
            <p className="auth-guest-copy">Guest progress is saved on this device.</p>
          </div>
        )}
      </form>
    </div>
  )
}
