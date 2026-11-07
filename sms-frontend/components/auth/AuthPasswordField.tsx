'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { authStyles as styles } from './AuthPage';

export default function AuthPasswordField({ id, label, value, onChange, autoComplete, placeholder, describedBy, invalid, minLength, maxLength }: {
  id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string;
  placeholder: string; describedBy?: string; invalid?: boolean; minLength?: number; maxLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.passwordInput}>
      <input id={id} name={id} type={visible ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)}
        autoComplete={autoComplete} required placeholder={placeholder} aria-describedby={describedBy} aria-invalid={invalid || undefined}
        minLength={minLength} maxLength={maxLength} className={styles.input} />
      <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id}
        className={styles.passwordToggle} onClick={() => setVisible(current => !current)}>
        {visible ? <EyeOff size={21} aria-hidden="true" /> : <Eye size={21} aria-hidden="true" />}
      </button>
    </div>
  </div>;
}
