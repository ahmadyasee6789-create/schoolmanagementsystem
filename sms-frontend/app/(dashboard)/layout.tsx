"use client";
import Sidebar from "@/components/sidebar";
import Topbar from "@/components/Topbar";
import { Box,useTheme,useMediaQuery } from "@mui/material";
import { useState } from "react";

// ⚠️ These MUST exactly match the constants in Sidebar.tsx
const SIDEBAR_WIDTH   = 272; // drawerWidth in Sidebar
const COLLAPSED_WIDTH = 64;  // collapsedWidth in Sidebar
const TOPBAR_HEIGHT   = 64;
const EASE            = "360ms cubic-bezier(0.4, 0, 0.2, 1)";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  // const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false); // ← this must exist here

  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));


  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#0D1117" }}>
      {/* Both are position:fixed — render outside main flow */}
     <Topbar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}        // ✅
        setMobileOpen={setMobileOpen}  // ✅
      />

      {/* Main content — offset matches sidebar width exactly */}
     <Box
  component="main"
  sx={{
    ml: { xs: 0, md: `${collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH}px` }, // ✅ xs: 0 is critical
    mt: `${TOPBAR_HEIGHT}px`,
    minHeight: `calc(100vh - ${TOPBAR_HEIGHT}px)`,
    backgroundColor: "#0D1117",
    backgroundImage:
      "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(245,158,11,0.04) 0%, transparent 60%)",
    transition: `margin-left ${EASE}`,
    boxSizing: "border-box",
  }}
>
  {children}
</Box>
    </Box>
  );
}