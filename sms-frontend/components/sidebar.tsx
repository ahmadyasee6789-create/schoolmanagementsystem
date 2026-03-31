"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/app/store/authStore";

// ─── MUI imports ────────────────────────────────────────────────────
import {
  Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Collapse, Box, Divider, Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  Groups as GroupsIcon,
  Assignment as AssignmentIcon,
  ChevronLeft as ChevronLeftIcon,
  ExpandLess, ExpandMore,
  AttachMoney,
  FiberManualRecord as DotIcon,
  Apartment,
} from "@mui/icons-material";
import SchoolIcon from "@mui/icons-material/School";
import { BarChart as BarChartIcon } from "@mui/icons-material";

// ─── Types ───────────────────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (val: boolean | ((v: boolean) => boolean)) => void;
  mobileOpen?: boolean;
  setMobileOpen?: (val: boolean) => void;
}

// ─── Constants ───────────────────────────────────────────────────────
const DRAWER_WIDTH    = 272;
const COLLAPSED_WIDTH = 64;
const TOPBAR_HEIGHT   = 64;
const EASE            = "360ms cubic-bezier(0.4, 0, 0.2, 1)";

// ─── Design tokens ───────────────────────────────────────────────────
const C = {
  bg:           "#111827",
  border:       "rgba(255,255,255,0.06)",
  accent:       "#F59E0B",
  accentDim:    "rgba(245,158,11,0.15)",
  accentText:   "#FCD34D",
  textPrimary:  "#F9FAFB",
  textSecondary:"rgba(249,250,251,0.5)",
  activeBg:     "rgba(245,158,11,0.14)",
  hoverBg:      "rgba(255,255,255,0.05)",
};

// ─── Data ─────────────────────────────────────────────────────────────
const topItems = [
  { text: "Dashboard", icon: <DashboardIcon sx={{ fontSize: 20 }} />, href: "/" },
];

const menuSections = [
  {
    title: "Academics",
    icon: <SchoolIcon sx={{ fontSize: 18 }} />,
    items: [
      { text: "Academic Years",  href: "/academics/sessions" },
      { text: "Terms",           href: "/academics/terms" },
      { text: "Subjects",        href: "/academics/add_subjects" },
      { text: "Assign Subjects", href: "/academics/assign_subjects" },
      { text: "Classrooms",      href: "/academics/classes" },
      {text:"Student Promotion", href:"/academics/promotion "}
    ],
  },
  {
    title: "Students",
    icon: <GroupsIcon sx={{ fontSize: 18 }} />,
    items: [
      { text: "Students",   href: "/students" },
      { text: "Attendance", href: "/students/attendances" },
    ],
  },
  {
    title: "Examinations",
    icon: <AssignmentIcon sx={{ fontSize: 18 }} />,
    items: [
      { text: "Exams",         href: "/exams" },
      { text: "Exam Papers",   href: "/exams/exam_paper" },
      { text: "ExamResults",   href: "/exams/exam_result" },
      { text: "DMC Generator", href: "/exams/dmc_generator" },
    ],
  },
  {
    title: "Finance",
    icon: <AttachMoney sx={{ fontSize: 18 }} />,
    items: [
      { text: "Fee Structure",  href: "/finance/fee-structure" },
      { text: "Fee Management", href: "/finance/fee-management" },
      { text: "Teacher Salary", href: "/finance/staff_payroll" },
      { text: "Expenses",       href: "/finance/expenses" },
    ],
  },
  {title:"Reports",
    icon:<BarChartIcon sx={{fontSize:18}}/>,
    items: [
      { text: "Student Report",     href: "/reports/students" },
      { text: "Fee Report",         href: "/reports/fees" },
      { text: "Exam Report",        href: "/reports/exams" },
      { text: "Attendance Report",  href: "/reports/attendance" },
      { text: "Payroll Report",  href: "/reports/payroll" },
  ],
  },
];

const orgSection = {
  title: "Organization",
  icon: <Apartment sx={{ fontSize: 18 }} />,
  items: [
    { text: " Organization Members", href: "/organization/team" },
    { text: "Invitations",  href: "/organization/invitations" },
  ],
};

// ─── Sub-components ───────────────────────────────────────────────────
function ActiveBar() {
  return (
    <Box sx={{
      position: "absolute", left: 0, top: "50%",
      transform: "translateY(-50%)",
      width: 3, height: "60%",
      borderRadius: "0 3px 3px 0",
      background: C.accent,
      boxShadow: `0 0 8px ${C.accent}`,
    }} />
  );
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <Divider sx={{ borderColor: C.border, my: 0.5 }} />;
  return (
    <Box sx={{ px: 2, pt: 2.5, pb: 0.5 }}>
      <Typography sx={{
        fontSize: "0.65rem",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: C.textSecondary,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {label}
      </Typography>
    </Box>
  );
}

// ─── Drawer Content ───────────────────────────────────────────────────
function DrawerContent({
  collapsed,
  setCollapsed,
  onNavClick,
}: {
  collapsed: boolean;
  setCollapsed: (val: boolean | ((v: boolean) => boolean)) => void;
  onNavClick?: () => void;
}) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const pathname = usePathname();
  const router   = useRouter();
  const { user } = useAuthStore();
  const orgName  = useAuthStore((s) => s.user?.org_name);
  const role = user?.org_role;
  const roleAccess = {
  admin: "all",
  manager: "all",
  teacher: [ "Classrooms", "Attendance"],
  accountant: ["Finance"],
};

  const hasAdminAccess = ["admin", "manager"].includes(user?.org_role ?? "");

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const toggle = (title: string) =>
    setOpenSection(prev => prev === title ? null : title);

  const handleNav = (href: string) => {
    router.push(href);
    onNavClick?.();
  };

  const sectionBtnSx = (active: boolean) => ({
    borderRadius: "10px",
    mb: 0.5,
    mx: 0.5,
    px: collapsed ? 1 : 1.5,
    py: 1,
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: collapsed ? "center" : "flex-start",
    backgroundColor: active ? C.activeBg : "transparent",
    transition: `background ${EASE}, padding ${EASE}`,
    "&:hover": { backgroundColor: active ? C.activeBg : C.hoverBg },
  });

  const subItemSx = (active: boolean) => ({
    borderRadius: "8px",
    mb: 0.25,
    ml: 2,
    mr: 0.5,
    pl: 2,
    py: 0.75,
    position: "relative",
    backgroundColor: active ? C.accentDim : "transparent",
    transition: `background ${EASE}`,
    "&:hover": { backgroundColor: active ? C.accentDim : C.hoverBg },
  });

  const iconSx = (active: boolean) => ({
    minWidth: 0,
    mr: collapsed ? 0 : 1.5,
    color: active ? C.accentText : C.textSecondary,
    transition: `color ${EASE}, margin ${EASE}`,
    display: "flex",
    alignItems: "center",
  });

  const textSx = (active: boolean) => ({
    "& .MuiListItemText-primary": {
      fontSize: "0.875rem",
      fontWeight: active ? 600 : 400,
      color: active ? C.textPrimary : C.textSecondary,
      fontFamily: "'DM Sans', sans-serif",
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
      transition: `color ${EASE}`,
    },
  });

  const expandIconSx = { color: C.textSecondary, fontSize: 18 };
  
  return (
    <Box sx={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden", // prevent outer container from scrolling
    }}>

      {/* ── Brand strip — never scrolls away ──────────────── */}
      {!collapsed && (
        <Box sx={{
          px: 2.5, py: 2,
          borderBottom: `1px solid ${C.border}`,
          background: "linear-gradient(135deg, rgba(245,158,11,0.08) 0%, transparent 60%)",
          flexShrink: 0,
        }}>
          <Typography sx={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "1.1rem",
            fontWeight: 600,
            color: C.textPrimary,
            letterSpacing: "0.02em",
          }}>
            {orgName || "Loading..."}
          </Typography>
          <Typography sx={{
            fontSize: "0.7rem",
            color: C.accent,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}>
            School Portal
          </Typography>
        </Box>
      )}

      {/* ── Scrollable nav ────────────────────────────────── */}
      <Box sx={{
        py: 1.5,
        flexGrow: 1,
        overflowY: "auto",       // enables scrolling
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch", // smooth iOS scroll
        // hide the scrollbar track (fixes white bar on desktop)
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
      }}>
        <List disablePadding sx={{ px: 0.5 }}>

          {topItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Tooltip key={item.text} title={collapsed ? item.text : ""} placement="right">
                <ListItemButton onClick={() => handleNav(item.href)} sx={sectionBtnSx(active)}>
                  {active && <ActiveBar />}
                  <Box sx={iconSx(active)}>{item.icon}</Box>
                  {!collapsed && <ListItemText primary={item.text} sx={textSx(active)} />}
                </ListItemButton>
              </Tooltip>
            );
          })}
          

          {menuSections.map((section) => {
            const sectionActive = section.items.some(i => isActive(i.href));
            const isOpen = openSection === section.title;

            return (
              <Box key={section.title}>
                <SectionLabel label={section.title} collapsed={collapsed} />

                <Tooltip title={collapsed ? section.title : ""} placement="right">
                  <ListItemButton
                    onClick={() => !collapsed && toggle(section.title)}
                    sx={sectionBtnSx(sectionActive && collapsed)}
                  >
                    {sectionActive && collapsed && <ActiveBar />}
                    <Box sx={iconSx(sectionActive)}>{section.icon}</Box>
                    {!collapsed && (
                      <>
                        <ListItemText primary={section.title} sx={textSx(sectionActive)} />
                        {isOpen ? <ExpandLess sx={expandIconSx} /> : <ExpandMore sx={expandIconSx} />}
                      </>
                    )}
                  </ListItemButton>
                </Tooltip>

                <Collapse in={isOpen && !collapsed} timeout={280} unmountOnExit>
                  <List disablePadding>
                    {section.items.map((sub) => {
                      const active = isActive(sub.href);
                      return (
                        <ListItemButton
                          key={sub.href}
                          component={Link}
                          href={sub.href}
                          onClick={onNavClick}
                          sx={subItemSx(active)}
                        >
                          {active && (
                            <Box sx={{
                              position: "absolute", left: 0, top: "50%",
                              transform: "translateY(-50%)",
                              width: 2, height: "50%",
                              borderRadius: "0 2px 2px 0",
                              background: C.accent,
                            }} />
                          )}
                          <ListItemIcon sx={{ minWidth: 0, mr: 1.5 }}>
                            <DotIcon sx={{
                              fontSize: active ? 7 : 5,
                              color: active ? C.accent : C.textSecondary,
                              transition: `all ${EASE}`,
                            }} />
                          </ListItemIcon>
                          <ListItemText
                            primary={sub.text}
                            sx={{
                              "& .MuiListItemText-primary": {
                                fontSize: "0.82rem",
                                fontWeight: active ? 600 : 400,
                                color: active ? C.accentText : C.textSecondary,
                                fontFamily: "'DM Sans', sans-serif",
                                whiteSpace: "nowrap",
                              },
                            }}
                          />
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Collapse>
              </Box>
            );
          })}

          {hasAdminAccess && (
            <Box>
              <SectionLabel label="Organization" collapsed={collapsed} />

              <Tooltip title={collapsed ? "Organization" : ""} placement="right">
                <ListItemButton
                  onClick={() => !collapsed && toggle("Organization")}
                  sx={sectionBtnSx(orgSection.items.some(i => isActive(i.href)) && collapsed)}
                >
                  <Box sx={iconSx(orgSection.items.some(i => isActive(i.href)))}>{orgSection.icon}</Box>
                  {!collapsed && (
                    <>
                      <ListItemText primary="Organization" sx={textSx(false)} />
                      {openSection === "Organization"
                        ? <ExpandLess sx={expandIconSx} />
                        : <ExpandMore sx={expandIconSx} />}
                    </>
                  )}
                </ListItemButton>
              </Tooltip>

              <Collapse in={openSection === "Organization" && !collapsed} timeout={280} unmountOnExit>
                <List disablePadding>
                  {orgSection.items.map((sub) => {
                    const active = isActive(sub.href);
                    return (
                      <ListItemButton
                        key={sub.href}
                        component={Link}
                        href={sub.href}
                        onClick={onNavClick}
                        sx={subItemSx(active)}
                      >
                        <ListItemIcon sx={{ minWidth: 0, mr: 1.5 }}>
                          <DotIcon sx={{
                            fontSize: active ? 7 : 5,
                            color: active ? C.accent : C.textSecondary,
                          }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={sub.text}
                          sx={{
                            "& .MuiListItemText-primary": {
                              fontSize: "0.82rem",
                              fontWeight: active ? 600 : 400,
                              color: active ? C.accentText : C.textSecondary,
                              fontFamily: "'DM Sans', sans-serif",
                            },
                          }}
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              </Collapse>
            </Box>
          )}
        </List>
      </Box>

      {/* ── Collapse toggle — never scrolls away ─────────── */}
      <Box
        onClick={() => setCollapsed(v => !v)}
        sx={{
          borderTop: `1px solid ${C.border}`,
          p: 1.5,
          display: { xs: "none", md: "flex" },
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-end",
          cursor: "pointer",
          flexShrink: 0,
          "&:hover": { backgroundColor: C.hoverBg },
          transition: `background ${EASE}`,
        }}
      >
        <Box sx={{
          width: 28, height: 28,
          borderRadius: "8px",
          border: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: C.textSecondary,
          transition: `transform ${EASE}, border-color ${EASE}`,
          transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
          "&:hover": { borderColor: C.accent, color: C.accent },
        }}>
          <ChevronLeftIcon sx={{ fontSize: 18 }} />
        </Box>
        {!collapsed && (
          <Typography sx={{
            ml: 1, fontSize: "0.72rem", color: C.textSecondary,
            fontFamily: "'DM Sans', sans-serif",
            letterSpacing: "0.05em",
          }}>
            Collapse
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ─── Main Component ───────────────────────────────────────────────────
export default function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen = false,
  setMobileOpen,
}: SidebarProps) {

  // Shared paper styles — overflow hidden + scrollbar hidden fixes white bar
  const paperSx = {
    backgroundColor: C.bg,
    borderRight: `1px solid ${C.border}`,
    overflow: "hidden",          // let DrawerContent handle its own scroll
    scrollbarWidth: "none" as const,
    "&::-webkit-scrollbar": { display: "none" },
  };

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@600&display=swap');`}</style>

      {/* ── Mobile drawer ─────────────────────────────────── */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen?.(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            ...paperSx,
            width: DRAWER_WIDTH,
            top: TOPBAR_HEIGHT,
            height: `calc(100vh - ${TOPBAR_HEIGHT}px)`,
            boxShadow: "4px 0 32px rgba(0,0,0,0.5)",
          },
        }}
      >
        <DrawerContent
          collapsed={false}
          setCollapsed={setCollapsed}
          onNavClick={() => setMobileOpen?.(false)}
        />
      </Drawer>

      {/* ── Desktop drawer ────────────────────────────────── */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          width: collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH,
          flexShrink: 0,
          overflow: "hidden",    // hides scrollbar on the drawer wrapper too
          "& .MuiDrawer-paper": {
            ...paperSx,
            width: collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH,
            position: "fixed",
            top: TOPBAR_HEIGHT,
            height: `calc(100vh - ${TOPBAR_HEIGHT}px)`,
            transition: `width ${EASE}`,
            boxShadow: "4px 0 24px rgba(0,0,0,0.35)",
          },
        }}
      >
        <DrawerContent
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />
      </Drawer>
    </>
  );
}