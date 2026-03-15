"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  AppBar, Toolbar, Box, Avatar, Menu, MenuItem,
  IconButton, ListItemIcon, Divider, Typography,
  useMediaQuery, useTheme,
} from "@mui/material";
import LogoutIcon          from "@mui/icons-material/Logout";

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MenuIcon            from "@mui/icons-material/Menu";
import CloseIcon           from "@mui/icons-material/Close";
import { useRouter }       from "next/navigation";
import { useAuthStore }    from "@/app/store/authStore";
import Link                from "next/link";
import axios               from "axios";

// ─── Design tokens (mirror Sidebar) ──────────────────────────────────
const C = {
  bg:           "#111827",
  border:       "rgba(255,255,255,0.06)",
  accent:       "#F59E0B",
  accentDim:    "rgba(245,158,11,0.12)",
  accentText:   "#FCD34D",
  textPrimary:  "#F9FAFB",
  textSecondary:"rgba(249,250,251,0.5)",
  hoverBg:      "rgba(255,255,255,0.05)",
  menuBg:       "#1C2333",
  menuBorder:   "rgba(255,255,255,0.08)",
  errorRed:     "#F87171",
};

const TOPBAR_HEIGHT = 64;
const EASE = "260ms cubic-bezier(0.4, 0, 0.2, 1)";

// ─── Props ─────────────────────────────────────────────────────────────
interface TopbarProps {
  mobileOpen?: boolean;
  setMobileOpen?: (val: boolean) => void;
}

export default function Topbar({ mobileOpen = false, setMobileOpen }: TopbarProps) {
  const router          = useRouter();
  const { user, logout } = useAuthStore();
  const theme           = useTheme();
  const isMobile        = useMediaQuery(theme.breakpoints.down("md"));

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleLogout = async () => {
    try {
      logout();
      await axios.post("http://localhost:8000/auth/logout", {}, { withCredentials: true });
      router.replace("/signin");
    } catch {
      router.replace("/signin");
    }
  };

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "U";

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@600&display=swap');`}</style>

      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          height: TOPBAR_HEIGHT,
          backgroundColor: C.bg,
          borderBottom: `1px solid ${C.border}`,
          boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
        }}
      >
        <Toolbar
          sx={{
            height: TOPBAR_HEIGHT,
            minHeight: `${TOPBAR_HEIGHT}px !important`,
            px: { xs: 1.5, sm: 3 },
            display: "flex",
            alignItems: "center",
            gap: { xs: 1, sm: 2 },
          }}
        >
          {/* ── Hamburger (mobile only) ────────────────────── */}
          <IconButton
            onClick={() => setMobileOpen?.(!mobileOpen)}
            sx={{
              display: { xs: "flex", md: "none" },
              color: C.textPrimary,
              border: `1px solid ${mobileOpen ? C.accent : C.border}`,
              borderRadius: "10px",
              width: 38,
              height: 38,
              backgroundColor: mobileOpen ? C.accentDim : "transparent",
              transition: `all ${EASE}`,
              flexShrink: 0,
              "&:hover": {
                backgroundColor: C.hoverBg,
                borderColor: "rgba(245,158,11,0.4)",
              },
            }}
          >
            {mobileOpen
              ? <CloseIcon sx={{ fontSize: 20 }} />
              : <MenuIcon  sx={{ fontSize: 20 }} />
            }
          </IconButton>

          {/* ── Logo ──────────────────────────────────────── */}
          <Box sx={{ flexGrow: 1, display: "flex", alignItems: "center" }}>
            <Link href="/" style={{ display: "flex", alignItems: "center" }}>
              <Image
                src="/logo2.png"
                alt="Schoolify SMS"
                width={isMobile ? 120 : 160}
                height={48}
                priority
                style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
              />
            </Link>
          </Box>

          {/* ── Right side: user chip ──────────────────────── */}
          <IconButton
            onClick={(e) => setAnchorEl(e.currentTarget)}
            disableRipple
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 0.5, sm: 1 },
              px: { xs: 0.75, sm: 1.25 },
              py: 0.75,
              borderRadius: "10px",
              border: `1px solid ${open ? C.accent : C.border}`,
              backgroundColor: open ? C.accentDim : "transparent",
              transition: `all ${EASE}`,
              flexShrink: 0,
              "&:hover": {
                backgroundColor: C.hoverBg,
                borderColor: "rgba(245,158,11,0.4)",
              },
            }}
          >
            <Avatar
              alt={user?.full_name}
              sx={{
                width: 30,
                height: 30,
                fontSize: "0.72rem",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                backgroundColor: C.accent,
                color: "#111827",
                border: `2px solid ${C.border}`,
              }}
            >
              {initials}
            </Avatar>

            <Typography
              sx={{
                display: { xs: "none", sm: "block" },
                fontSize: "0.82rem",
                fontWeight: 500,
                color: C.textPrimary,
                fontFamily: "'DM Sans', sans-serif",
                letterSpacing: "0.01em",
                maxWidth: 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.full_name ?? "User"}
            </Typography>

            <KeyboardArrowDownIcon
              sx={{
                fontSize: 18,
                color: C.textSecondary,
                transition: `transform ${EASE}`,
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                display: { xs: "none", sm: "block" },
              }}
            />
          </IconButton>

          {/* ── Dropdown menu ─────────────────────────────── */}
          <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={() => setAnchorEl(null)}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
            slotProps={{
              paper: {
                elevation: 0,
                sx: {
                  mt: 1,
                  minWidth: 200,
                  backgroundColor: C.menuBg,
                  border: `1px solid ${C.menuBorder}`,
                  borderRadius: "12px",
                  boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
                  overflow: "visible",
                  "&::before": {
                    content: '""',
                    display: "block",
                    position: "absolute",
                    top: -6,
                    right: 18,
                    width: 12,
                    height: 12,
                    backgroundColor: C.menuBg,
                    border: `1px solid ${C.menuBorder}`,
                    borderBottom: "none",
                    borderRight: "none",
                    transform: "rotate(45deg)",
                    zIndex: 0,
                  },
                },
              },
            }}
          >
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography sx={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: C.textPrimary,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {user?.full_name ?? "User"}
              </Typography>
              {user?.email && (
                <Typography sx={{
                  fontSize: "0.72rem",
                  color: C.textSecondary,
                  fontFamily: "'DM Sans', sans-serif",
                  mt: 0.25,
                }}>
                  {user.email}
                </Typography>
              )}
            </Box>

            <Divider sx={{ borderColor: C.menuBorder }} />

          

            <Divider sx={{ borderColor: C.menuBorder, my: 0.5 }} />

            <MenuItem
              onClick={handleLogout}
              sx={{ ...menuItemSx, mb: 0.5, "&:hover": { backgroundColor: "rgba(248,113,113,0.08)" } }}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: 1.5 }}>
                <LogoutIcon sx={{ fontSize: 17, color: C.errorRed }} />
              </ListItemIcon>
              <Typography sx={{ ...menuTextSx, color: C.errorRed }}>Logout</Typography>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
    </>
  );
}

const menuItemSx = {
  px: 2, py: 1,
  mx: 0.5,
  borderRadius: "8px",
  transition: `background ${EASE}`,
  "&:hover": { backgroundColor: "rgba(255,255,255,0.05)" },
};

const menuTextSx = {
  fontSize: "0.84rem",
  fontWeight: 400,
  color: "rgba(249,250,251,0.8)",
  fontFamily: "'DM Sans', sans-serif",
};