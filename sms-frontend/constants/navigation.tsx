import {
  GraduationCap,
  Users2,
  FileText,
  DollarSign,
  BarChart3,
  Building2,
  CalendarRange,
  BookOpen,
  Layers,
  ClipboardList,
  UserCog,
  Wallet,
  Banknote,
  Receipt,
  Mail,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  section: string;
}

export const sectionIcons: Record<string, LucideIcon> = {
  Overview: LayoutDashboard,
  Academics: GraduationCap,
  Students: Users2,
  Examinations: FileText,
  Finance: DollarSign,
  Reports: BarChart3,
  Organization: Building2,
};

export const navigation: NavigationItem[] = [
    //overview
  { label: "Dashboard", href: "/", icon: BarChart3, section: "Overview" },
  // ── Academics ────────────────────────────
  { label: "Academic Years", href: "/academics/sessions", icon: CalendarRange, section: "Academics" },
  { label: "Terms", href: "/academics/terms", icon: CalendarRange, section: "Academics" },
  { label: "Subjects", href: "/academics/add_subjects", icon: BookOpen, section: "Academics" },
  { label: "Assign Subjects", href: "/academics/assign_subjects", icon: Layers, section: "Academics" },
  { label: "Classrooms", href: "/academics/classes", icon: GraduationCap, section: "Academics" },
  { label: "Student Promotion", href: "/academics/promotion", icon: Layers, section: "Academics" },

  // ── Students ─────────────────────────────
  { label: "Students", href: "/students", icon: Users2, section: "Students" },
  { label: "Attendance", href: "/students/attendances", icon: ClipboardList, section: "Students" },

  // ── Examinations ─────────────────────────
  { label: "Exams", href: "/exams", icon: FileText, section: "Examinations" },
  { label: "Exam Papers", href: "/exams/exam_paper", icon: FileText, section: "Examinations" },
  { label: "Exam Results", href: "/exams/exam_result", icon: ClipboardList, section: "Examinations" },
  { label: "DMC Generator", href: "/exams/dmc_generator", icon: FileText, section: "Examinations" },

  // ── Finance ──────────────────────────────
  { label: "Employees", href: "/employees", icon: UserCog, section: "Finance" },
  { label: "Fee Structure", href: "/finance/fee-structure", icon: Wallet, section: "Finance" },
  { label: "Fee Management", href: "/finance/fee-management", icon: DollarSign, section: "Finance" },
  { label: "Teacher Salary", href: "/finance/staff_payroll", icon: Banknote, section: "Finance" },
  { label: "Expenses", href: "/finance/expenses", icon: Receipt, section: "Finance" },

  // ── Reports ──────────────────────────────
  { label: "Student Report", href: "/reports/students", icon: BarChart3, section: "Reports" },
  { label: "Fee Report", href: "/reports/fees", icon: BarChart3, section: "Reports" },
  { label: "Exam Report", href: "/reports/exams", icon: BarChart3, section: "Reports" },
  { label: "Attendance Report", href: "/reports/attendance", icon: BarChart3, section: "Reports" },
  { label: "Payroll Report", href: "/reports/payroll", icon: BarChart3, section: "Reports" },

  // ── Organization ─────────────────────────
  { label: "Organization Members", href: "/organization/team", icon: Building2, section: "Organization" },
  { label: "Invitations", href: "/organization/invitations", icon: Mail, section: "Organization" },
];