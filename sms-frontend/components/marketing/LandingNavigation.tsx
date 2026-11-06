"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import SchoolixMark from "@/components/brand/SchoolixMark";
import styles from "./LandingPage.module.css";

const links = [{ href: "#features", label: "Features" }, { href: "#how-it-works", label: "How It Works" }, { href: "#contact", label: "Contact" }];

export default function LandingNavigation() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return <header className={styles.header}>
    <nav className={`${styles.container} ${styles.navigation}`} aria-label="Main navigation" onKeyDown={(event) => {
      if (event.key === "Escape" && open) { setOpen(false); toggle.current?.focus(); }
    }}>
      <Link href="/" prefetch={false} className={styles.brand} aria-label="Schoolix home"><SchoolixMark size={31} /><span>School<span className={styles.brandAccent}>ix</span></span></Link>
      <div className={styles.desktopLinks}>{links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</div>
      <div className={styles.desktopActions}><Link prefetch={false} href="/signin" className={styles.login}>Login</Link><a href="#contact" className={styles.smallButton}>Request a Demo <ArrowUpRight size={16} aria-hidden="true" /></a></div>
      <button ref={toggle} type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="public-mobile-navigation" className={styles.menuToggle} onClick={() => setOpen(!open)}>{open ? <X size={23} /> : <Menu size={23} />}</button>
      {open && <div id="public-mobile-navigation" className={styles.mobileLinks}>{links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}<Link href="/signin" prefetch={false}>Login</Link><a href="#contact" className={styles.smallButton} onClick={() => setOpen(false)}>Request a Demo <ArrowUpRight size={16} aria-hidden="true" /></a></div>}
    </nav>
  </header>;
}
