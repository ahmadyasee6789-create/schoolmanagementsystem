import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, BarChart3, CalendarCheck, Check, FileText, GraduationCap, Layers, Plus, ShieldCheck, UsersRound, Wallet } from "lucide-react";
import SchoolixLogo from "@/components/brand/SchoolixLogo";
import LandingNavigation from "@/components/marketing/LandingNavigation";
import ProductPreview from "@/components/marketing/ProductPreview";
import ProductShowcase from "@/components/marketing/ProductShowcase";
import { contactEmail, demoHref, demoUrl, siteUrl } from "@/app/lib/publicSite";
import styles from "@/components/marketing/LandingPage.module.css";

const description = "Schoolix connects student records, attendance, fee collection, examinations, DMCs and reports in one organized school management workspace.";
export const metadata: Metadata = {
  title: "Schoolix — A clearer way to manage your school",
  description,
  ...(siteUrl ? { metadataBase: siteUrl, alternates: { canonical: "/" } } : {}),
  openGraph: { title: "Schoolix — School days, made simpler.", description, type: "website", ...(siteUrl ? { url: siteUrl.href } : {}) },
  twitter: { card: "summary", title: "Schoolix — School days, made simpler.", description },
};

const features = [
  { icon: UsersRound, title: "Student Management", description: "Keep personal details, enrollments and academic history together, from admission onward." },
  { icon: CalendarCheck, title: "Attendance", description: "Record daily classroom attendance and review it alongside your student information." },
  { icon: Wallet, title: "Fee Collection", description: "Manage monthly and multi-month payments, previous dues, advance credit and receipts." },
  { icon: GraduationCap, title: "Examinations", description: "Organize terms, subject papers and marks entry with a clear review and locking process." },
  { icon: FileText, title: "DMC Generation", description: "Turn saved examination results into professional, print-ready marks certificates." },
  { icon: BarChart3, title: "Reports", description: "Bring student, attendance, examination and financial summaries into a clearer view." },
];
const steps = [
  { title: "Make it your school’s workspace.", description: "Set up the academic session, classrooms, subjects and fee structures that match your school." },
  { title: "Bring your team together.", description: "Add student records and give administrators, teachers and accounts staff the appropriate access." },
  { title: "Run the day. Review the term.", description: "Mark attendance, collect fees, record results and prepare the documents your school needs." },
];
const faqs = [
  { question: "Is Schoolix suitable for more than one school?", answer: "Schoolix uses separate organization workspaces. Each school’s records are scoped to its organization, with access determined by authenticated membership." },
  { question: "Can our team have different access levels?", answer: "Yes. The application has roles for school administrators, managers, teachers and accountants. Available actions depend on the person’s permissions." },
  { question: "Can we collect several months of fees together?", answer: "Yes. Fee collection supports monthly, quarterly, half-yearly, yearly and custom periods, along with partial payments and advance credit." },
  { question: "Does it include examinations and printable DMCs?", answer: "Yes. You can manage exams and papers, enter marks by class or subject, use the school’s grade scale, and generate printable DMC documents from saved results." },
  { question: "Do we need to start with every module?", answer: "A demo can help you review the available modules and plan how to set up the system around your school’s existing routines." },
  { question: "How can we see the real application?", answer: "Use the Request a Demo section below for a walkthrough when booking is available. The previews on this page illustrate the interface and contain no private school data." },
];

export default function LandingPage() {
  return <div className={`${styles.page} schoolix-landing`}>
    <a href="#main-content" className={styles.skipLink}>Skip to content</a>
    <LandingNavigation />
    <main id="main-content">
      <section className={`${styles.container} ${styles.hero}`} aria-labelledby="hero-title">
        <div className={styles.heroCopy}><p className={styles.heroEyebrow}><span />School management, thoughtfully connected</p>
          <h1 id="hero-title">School days,<br /><span>made simpler.</span></h1>
          <p className={styles.heroDescription}>Student records, fees, attendance and exams. One connected workspace for the people who run your school.</p>
          <div className={styles.heroActions}><a href="#contact" className={styles.primaryButton}>Request a Demo <ArrowUpRight size={19} aria-hidden="true" /></a><a href="#product" className={styles.textButton}>Take a closer look <ArrowDown size={16} aria-hidden="true" /></a></div>
          <p className={styles.heroFootnote}><ShieldCheck size={17} aria-hidden="true" />A dedicated workspace. The right access for your team.</p>
        </div>
        <div className={styles.heroVisual}><div className={styles.previewHalo} /><ProductPreview /><div className={styles.heroAnnotation}><span><Check size={15} aria-hidden="true" /></span>Everything, in its place.</div></div>
      </section>

      <div className={`${styles.container} ${styles.introStrip}`}><span>Built around the school day</span><div><span><Layers size={17} aria-hidden="true" />Connected modules</span><span><ShieldCheck size={17} aria-hidden="true" />Role-based access</span><span><FileText size={17} aria-hidden="true" />Print-ready documents</span></div></div>

      <section id="features" className={`${styles.container} ${styles.section}`} aria-labelledby="features-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>THE EVERYDAY ESSENTIALS</p><h2 id="features-title">Less back-and-forth.<br />More working together.</h2></div><p>The important parts of running a school belong in the same place. Schoolix keeps them connected, with a familiar workflow for your team.</p></div>
        <div className={styles.featureGrid}>{features.map(({ icon: Icon, title, description: detail }, index) => <article key={title} className={styles.feature}><div className={styles.featureTop}><span className={styles.featureIcon}><Icon size={24} strokeWidth={1.7} aria-hidden="true" /></span><span>0{index + 1}</span></div><h3>{title}</h3><p>{detail}</p></article>)}</div>
      </section>

      <section id="product" className={styles.showcase} aria-labelledby="product-title"><div className={styles.container}><div className={styles.centerHeading}><p className={styles.eyebrow}>A FAMILIAR PLACE FOR YOUR TEAM</p><h2 id="product-title">See the whole picture.<br />Find the detail you need.</h2><p>Purposeful screens for everyday tasks, from the morning overview to end-of-term results.</p></div><ProductShowcase /></div></section>

      <section id="how-it-works" className={`${styles.container} ${styles.section} ${styles.howSection}`} aria-labelledby="how-title"><div className={styles.howIntro}><p className={styles.eyebrow}>FROM SETUP TO SCHOOL DAY</p><h2 id="how-title">A clear start.<br />A better routine.</h2><p>Start with your school’s structure. Then give the people doing the work one place to do it.</p><a href="#contact" className={styles.textButton}>Let’s walk through it <ArrowRight size={17} aria-hidden="true" /></a></div><ol className={styles.steps}>{steps.map((step, index) => <li key={step.title}><span className={styles.stepNumber}>0{index + 1}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>)}</ol></section>

      <section id="faq" className={`${styles.container} ${styles.faqSection}`} aria-labelledby="faq-title"><div><p className={styles.eyebrow}>GOOD QUESTIONS</p><h2 id="faq-title">A little more clarity.</h2><p>Some things school owners and administrators may want to know.</p></div><div className={styles.faqList}>{faqs.map((faq) => <details key={faq.question}><summary>{faq.question}<Plus size={19} aria-hidden="true" /></summary><p>{faq.answer}</p></details>)}</div></section>

      <section id="contact" className={`${styles.container} ${styles.contactSection}`} aria-labelledby="contact-title"><div className={styles.contactCard}><div><p className={styles.contactEyebrow}>LET’S TALK ABOUT YOUR SCHOOL</p><h2 id="contact-title">Make room for<br />a simpler school day.</h2><p>A walkthrough centered on your school, your team and the way you work.</p></div><div className={styles.contactAction}>{demoHref ? <a href={demoHref} target={demoUrl ? "_blank" : undefined} rel={demoUrl ? "noopener noreferrer" : undefined} className={styles.whiteButton}>Request a Demo <ArrowUpRight size={19} aria-hidden="true" /></a> : <><button type="button" disabled className={styles.whiteButton} aria-describedby="demo-booking-status">Demo booking coming soon</button><p id="demo-booking-status">Demo bookings will open here soon. Please check back for a guided walkthrough.</p></>}{contactEmail && <a className={styles.contactEmail} href={`mailto:${encodeURIComponent(contactEmail)}`}>{contactEmail}</a>}<span>Already using Schoolix? <Link href="/signin" prefetch={false}>Login <ArrowRight size={13} aria-hidden="true" /></Link></span></div></div></section>
    </main>
    <footer className={`${styles.container} ${styles.footer}`}><div className={styles.footerTop}><div><Link href="/" prefetch={false} className={styles.brand} aria-label="Schoolix home"><SchoolixLogo variant="full" size={30} /></Link><p>A clearer way to run your school.</p></div><nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#how-it-works">How It Works</a><a href="#faq">FAQ</a><a href="#contact">Contact</a><Link href="/signin" prefetch={false}>Login</Link></nav></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} Schoolix. All rights reserved.</span><span>Thoughtfully connected. Purposefully simple.</span></div></footer>
  </div>;
}
