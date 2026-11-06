"use client";

import { useId, useRef, useState } from "react";
import { Check } from "lucide-react";
import ProductPreview, { type PreviewScreen } from "./ProductPreview";
import styles from "./LandingPage.module.css";

const screens: { id: PreviewScreen; label: string; title: string; description: string; points: string[] }[] = [
  { id: "dashboard", label: "Dashboard", title: "Start the day with clarity.", description: "Bring student, attendance and financial summaries into one familiar overview.", points: ["A shared view of school operations", "Summaries for the academic session", "Quick access to everyday tasks"] },
  { id: "fees", label: "Fees & receipts", title: "Keep every payment in view.", description: "Review dues, collect fees across months, and follow each student's payment history.", points: ["Monthly and multi-month collections", "Full, partial and advance payments", "Printable receipts and fee history"] },
  { id: "exams", label: "Examinations", title: "Give results a clear process.", description: "Set up papers, enter class-wise marks, and prepare DMCs from the same saved results.", points: ["Class and subject marks entry", "Controlled examination locking", "Grade scales and printable DMCs"] },
];

export default function ProductShowcase() {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const screen = screens[selected];
  return <>
    <div className={styles.productTabs} role="tablist" aria-label="Explore product screens">{screens.map((item, index) => <button key={item.id} type="button" id={`${id}-${item.id}`} ref={(element) => { buttons.current[index] = element; }} role="tab" aria-selected={selected === index} aria-controls={`${id}-panel`} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={(event) => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? screens.length - 1 : (selected + (event.key === "ArrowRight" ? 1 : -1) + screens.length) % screens.length;
      setSelected(next); buttons.current[next]?.focus();
    }}>{item.label}</button>)}</div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${screen.id}`} className={styles.showcasePanel}>
      <div className={styles.showcaseCopy}><span className={styles.eyebrow}>A CLOSER LOOK</span><h3>{screen.title}</h3><p>{screen.description}</p><ul>{screen.points.map((point) => <li key={point}><Check size={17} aria-hidden="true" />{point}</li>)}</ul><p className={styles.previewNote}>Data-free interface previews. Request a demo to explore the real application.</p></div>
      <ProductPreview screen={screen.id} />
    </div>
  </>;
}
