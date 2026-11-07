import type { ElementType } from "react";
// app/superadmin/components/StatCard.tsx
import { Box, Typography } from "@mui/material";
import { C, FONT } from "../constants";
import { fadeUp } from "../styles";

export function StatCard({
  label, value, color, icon: Icon, delay = 0,
}: {
  label: string;
  value: number;
  color: string;
  icon: ElementType;
  delay?: number;
}) {
  return (
    <Box sx={{
      backgroundColor: C.surface,
      border:          `1px solid ${C.border}`,
      borderRadius:    "12px",
      p:               2.5,
      position:        "relative",
      overflow:        "hidden",
      animation:       `fadeUp 0.4s ${delay}ms ease both`,
      ...fadeUp,
      "&::before": {
        content:      '""',
        position:     "absolute",
        top:          0, left: 0, right: 0,
        height:       "2px",
        background:   color,
        opacity:      0.6,
      },
      "&:hover": { borderColor: `color-mix(in srgb, ${color} 25%, transparent)` },
      transition: "border-color 0.2s",
    }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography sx={{
            fontFamily:    FONT,
            fontSize:      "0.65rem",
            color:         C.textSecondary,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            mb:            1,
          }}>
            {label}
          </Typography>
          <Typography sx={{
            fontFamily: FONT,
            fontSize:   "2rem",
            fontWeight: 700,
            color,
            lineHeight: 1,
          }}>
            {value}
          </Typography>
        </Box>
        <Box sx={{
          width:           40,
          height:          40,
          borderRadius:    "10px",
          backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
          border:          `1px solid color-mix(in srgb, ${color} 15%, transparent)`,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
        }}>
          <Icon sx={{ fontSize: 18, color }} />
        </Box>
      </Box>
    </Box>
  );
}