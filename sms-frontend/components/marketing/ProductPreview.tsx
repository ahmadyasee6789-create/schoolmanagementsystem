import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  Check,
  ChevronDown,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Search,
  UsersRound,
  Wallet,
} from "lucide-react";
import SchoolixLogo from "@/components/brand/SchoolixLogo";
import styles from "./LandingPage.module.css";

export type PreviewScreen = "dashboard" | "fees" | "exams";
const menu = [
  LayoutDashboard,
  UsersRound,
  CalendarCheck,
  Wallet,
  GraduationCap,
  BarChart3,
];
const menuNames = [
  "Dashboard",
  "Students",
  "Attendance",
  "Fees",
  "Examinations",
  "Reports",
];
const titles = {
  dashboard: "Your school, at a glance",
  fees: "A clearer view of every fee",
  exams: "From marks to meaningful results",
};

export default function ProductPreview({
  screen = "dashboard",
}: {
  screen?: PreviewScreen;
}) {
  return (
    <div
      className={styles.productFrame}
      role="img"
      aria-label={`Schoolix ${screen} interface mockup, with placeholders and no school data`}
    >
      <div className={styles.windowBar} aria-hidden="true">
        <span className={styles.windowDots}>
          <i />
          <i />
          <i />
        </span>
        <span>
          Schoolix ·{" "}
          {screen === "dashboard"
            ? "Workspace overview"
            : screen === "fees"
              ? "Fee Management"
              : "Examinations"}
        </span>
        <span className={styles.previewPill}>Interface preview</span>
      </div>
      <div className={styles.previewWorkspace} aria-hidden="true">
        <aside className={styles.previewSidebar}>
          <div className={styles.previewBrand}>
            <SchoolixLogo variant="full" size={18} />
          </div>
          <span className={styles.previewMenuLabel}>WORKSPACE</span>
          {menu.map((Icon, index) => (
            <div
              key={menuNames[index]}
              className={
                index === (screen === "fees" ? 3 : screen === "exams" ? 4 : 0)
                  ? styles.previewMenuActive
                  : styles.previewMenuItem
              }
            >
              <Icon size={12} />
              <span>{menuNames[index]}</span>
            </div>
          ))}
          <div className={styles.previewSidebarFoot}>
            <span className={styles.avatarPlaceholder}>
              <GraduationCap size={12} />
            </span>
            <span>School workspace</span>
          </div>
        </aside>
        <div className={styles.previewMain}>
          <div className={styles.previewTopline}>
            <span>Academic workspace</span>
            <div>
              <Search size={12} />
              <Bell size={12} />
              <span className={styles.avatarPlaceholder}>S</span>
            </div>
          </div>
          <div className={styles.previewHeading}>
            <div>
              <h3>{titles[screen]}</h3>
              <p>
                {screen === "dashboard"
                  ? "Students, attendance and financial overview"
                  : screen === "fees"
                    ? "Obligations, collections and payment history"
                    : "Exams, subject papers and saved results"}
              </p>
            </div>
            <span className={styles.sessionPill}>
              Academic session <ChevronDown size={10} />
            </span>
          </div>
          <div className={styles.previewStats}>
            {(screen === "dashboard"
              ? ["Student records", "Attendance", "Fee collection"]
              : screen === "fees"
                ? ["Collected", "Outstanding", "Advance credit"]
                : ["Examinations", "Subject papers", "Saved results"]
            ).map((title, index) => (
              <div className={styles.previewStat} key={title}>
                <span className={styles.previewStatIcon}>
                  {index === 0 ? (
                    <UsersRound size={13} />
                  ) : index === 1 ? (
                    <CalendarCheck size={13} />
                  ) : (
                    <Wallet size={13} />
                  )}
                </span>
                <span>{title}</span>
                <strong>—</strong>
                <small>Current session</small>
              </div>
            ))}
          </div>
          {screen === "dashboard" ? (
            <div className={styles.previewCharts}>
              <div className={styles.chartCard}>
                <div className={styles.chartTitle}>
                  <b>Monthly overview</b>
                  <span>
                    <i />
                    Collections
                  </span>
                </div>
                <div className={styles.mockChart}>
                  {[34, 58, 46, 72, 60, 86, 69, 92].map((height, index) => (
                    <div key={index}>
                      <i style={{ height: `${height}%` }} />
                      <span />
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.attendanceCard}>
                <b>Attendance</b>
                <div className={styles.attendanceRing}>
                  <CalendarCheck size={22} />
                </div>
                <span>Daily class overview</span>
                <small>Present · Absent</small>
              </div>
            </div>
          ) : (
            <div className={styles.mockTable}>
              <div className={styles.mockTableHeading}>
                <b>
                  {screen === "fees" ? "Student fee history" : "Subject papers"}
                </b>
                <span>
                  {screen === "fees" ? "Session records" : "Classroom view"}
                </span>
              </div>
              <div className={styles.mockTableRow}>
                <b>{screen === "fees" ? "Billing period" : "Subject"}</b>
                <b>{screen === "fees" ? "Paid" : "Total marks"}</b>
                <b>{screen === "fees" ? "Balance" : "Pass marks"}</b>
                <b>Status</b>
              </div>
              {[0, 1, 2].map((item) => (
                <div key={item} className={styles.mockTableRow}>
                  <span className={styles.placeholderLine} />
                  <span>—</span>
                  <span>—</span>
                  <span className={styles.mockStatus}>
                    {screen === "fees" ? "Payment history" : "Draft"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className={styles.previewBottom}>
            <span>
              {screen === "exams" ? (
                <FileText size={13} />
              ) : (
                <BookOpen size={13} />
              )}
              {screen === "exams"
                ? "Print-ready DMC documents"
                : "One connected school workspace"}
            </span>
            <span>
              <Check size={11} />
              Role-based access
            </span>
          </div>
        </div>
      </div>
      <div className={styles.previewDisclaimer}>
        Illustrative layout · no student or financial data
      </div>
    </div>
  );
}
