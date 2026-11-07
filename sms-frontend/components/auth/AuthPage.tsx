import Link from 'next/link';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import SchoolixMark from '@/components/brand/SchoolixMark';
import styles from './AuthPage.module.css';

export { default as authStyles } from './AuthPage.module.css';

const benefits = [
  'Students, attendance, and fees in one place',
  'Clear dashboards for your school administration',
  'Secure, role-based access for your team',
];

export default function AuthPage({ headingId, signup = false, children }: { headingId: string; signup?: boolean; children: ReactNode }) {
  return <main className={`${styles.page}${signup ? ` ${styles.signupPage}` : ''}`}>
    <aside className={styles.brandPanel} aria-label="About Schoolix">
      <Link href="/" className={styles.brand} aria-label="Schoolix home">
        <SchoolixMark size={46} />
        <span>School<span className={styles.brandAccent}>ix</span></span>
      </Link>
      <div className={styles.introduction}>
        <h2>Run your school on <span>one platform</span></h2>
        <p className={styles.description}>
          Schoolix brings students, attendance, fees, and examinations together
          — so your entire school runs smoother, from the front office to the classroom.
        </p>
        <ul className={styles.benefits}>{benefits.map(benefit => <li key={benefit}>
          <span className={styles.check}><Check size={19} aria-hidden="true" /></span>{benefit}
        </li>)}</ul>
      </div>
      <p className={styles.copyright}>© {new Date().getFullYear()} Schoolix. All rights reserved.</p>
    </aside>
    <section className={styles.formPanel} aria-labelledby={headingId}>
      <div className={styles.card}>{children}</div>
    </section>
  </main>;
}
