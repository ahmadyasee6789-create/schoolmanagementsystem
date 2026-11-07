'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { api } from '@/app/lib/api';
import AuthPage, { authStyles as styles } from '@/components/auth/AuthPage';
import AuthPasswordField from '@/components/auth/AuthPasswordField';

type Policy = { enabled: boolean; trial_days: number; password_min_length: number; password_max_length: number };
type Form = { organization_name: string; full_name: string; email: string; password: string; confirm_password: string };
const emptyForm: Form = { organization_name: '', full_name: '', email: '', password: '', confirm_password: '' };

function errorMessage(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(item => typeof item?.msg === 'string' ? item.msg.replace(/^Value error, /, '') : '').filter(Boolean).join('. ') || 'Please check the registration details.';
  return 'Could not confirm registration. Try signing in before submitting again.';
}

export default function SignUpPage() {
  const [form, setForm] = useState<Form>(emptyForm);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyError, setPolicyError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void api.get<Policy>('/auth/signup-policy', { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setPolicy(data); setPolicyError('');
    }).catch(() => {
      if (!controller.signal.aborted) setPolicyError('Registration availability could not be checked. Please retry.');
    }).finally(() => { if (!controller.signal.aborted) setPolicyLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  function update(field: keyof Form, value: string) {
    setForm(current => ({ ...current, [field]: value }));
    setError('');
  }
  const mismatch = !!form.confirm_password && form.password !== form.confirm_password;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || !policy?.enabled || policyLoading || policyError) return;
    if (!form.organization_name.trim() || !form.full_name.trim()) { setError('School name and administrator name are required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Enter a valid administrator email.'); return; }
    if (form.password.length < policy.password_min_length || form.password.length > policy.password_max_length || form.password !== form.password.trim()) {
      setError(`Use ${policy.password_min_length}–${policy.password_max_length} characters, without spaces at the start or end.`); return;
    }
    if (form.password !== form.confirm_password) { setError('Passwords do not match.'); return; }
    inFlight.current = true; setLoading(true); setError('');
    try {
      await api.post('/auth/signup', { ...form, full_name: form.full_name.trim(), organization_name: form.organization_name.trim(), email: form.email.trim() }, { timeout: 30000 });
      setForm(emptyForm); setSuccess(true);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { inFlight.current = false; setLoading(false); }
  }

  return <AuthPage headingId="signup-heading" signup>
    <header className={styles.cardHeader}>
      <h1 id="signup-heading">{success ? 'Your school account is ready' : 'Create your school account'}</h1>
      <p>{success ? 'Welcome to Schoolix. Your next step is to sign in.' : 'One workspace for your school. Start with your administrator account.'}</p>
    </header>
    {success ? <div className={styles.success} role="status">
      <CheckCircle2 size={36} className={styles.successIcon} aria-hidden="true" />
      <p>Your school and administrator account have been created. Sign in to get started with your {policy?.trial_days}-day trial.</p>
      <Link href="/signin" className={styles.submit}>Continue to Sign In</Link>
    </div> : <>
      <form className={`${styles.form} ${styles.signupForm}`} onSubmit={event => void submit(event)} aria-busy={loading}>
        {policyLoading && <p className={styles.fieldHint} role="status">Checking registration availability…</p>}
        {policyError && <p role="alert" className={styles.error}>{policyError} <button type="button" className={styles.retry} onClick={() => { setPolicyLoading(true); setPolicyError(''); setAttempt(value => value + 1); }}>Retry</button></p>}
        {policy && !policy.enabled && <p role="alert" className={styles.error}>Public school registration is currently unavailable. Contact the service administrator to arrange access.</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <fieldset className={styles.fieldGroup} disabled={loading}>
          <legend>School information</legend>
          <div className={styles.field}>
            <label htmlFor="school-name">School name</label>
            <input id="school-name" name="organization_name" autoComplete="organization" required maxLength={200} value={form.organization_name}
              onChange={event => update('organization_name', event.target.value)} placeholder="Enter your school name" className={styles.input} />
          </div>
        </fieldset>
        <fieldset className={styles.fieldGroup} disabled={loading}>
          <legend>Administrator information</legend>
          <div className={styles.fieldRows}>
            <div className={styles.fieldPair}>
              <div className={styles.field}>
                <label htmlFor="admin-name">Full name</label>
                <input id="admin-name" name="full_name" autoComplete="name" required maxLength={150} value={form.full_name}
                  onChange={event => update('full_name', event.target.value)} placeholder="Your full name" className={styles.input} />
              </div>
              <div className={styles.field}>
                <label htmlFor="admin-email">Email address</label>
                <input id="admin-email" name="email" type="email" autoComplete="email" required value={form.email}
                  onChange={event => update('email', event.target.value)} placeholder="you@school.edu" className={styles.input} />
              </div>
            </div>
            <AuthPasswordField id="signup-password" label="Password" value={form.password} onChange={value => update('password', value)}
              autoComplete="new-password" placeholder="Create a password" minLength={policy?.password_min_length ?? 8} maxLength={policy?.password_max_length ?? 128} describedBy="password-policy" />
            <p id="password-policy" className={styles.fieldHint}>{policy?.password_min_length ?? 8}–{policy?.password_max_length ?? 128} characters. No spaces at the start or end.</p>
            <AuthPasswordField id="signup-confirm" label="Confirm password" value={form.confirm_password} onChange={value => update('confirm_password', value)}
              autoComplete="new-password" placeholder="Repeat your password" invalid={mismatch} describedBy={mismatch ? 'password-match' : undefined} />
            {form.confirm_password && <p id="password-match" className={styles.fieldHint}>{mismatch ? 'Passwords do not match.' : 'Passwords match.'}</p>}
          </div>
        </fieldset>
        <button type="submit" disabled={loading || policyLoading || !!policyError || !policy?.enabled || Object.values(form).some(value => !value)} className={styles.submit}>
          {loading && <LoaderCircle size={20} className={styles.spinner} aria-hidden="true" />}
          <span aria-live="polite">{loading ? 'Creating account…' : 'Create School Account'}</span>
        </button>
        {policy?.enabled && <p className={styles.fieldHint}>Includes a {policy.trial_days}-day trial. Paid plans are activated separately.</p>}
      </form>
      <p className={styles.register}>Already have an account? <Link href="/signin">Sign In</Link></p>
    </>}
  </AuthPage>;
}
