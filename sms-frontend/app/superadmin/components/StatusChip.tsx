// app/superadmin/components/StatusChip.tsx
import { Chip } from "@mui/material";
import { C, FONT } from "../constants";
import type { OrgStatus } from "../types";

export function StatusChip({ status }: { status: OrgStatus }) {
  const config = {
    trial:     { color: C.accent,  bg: C.accentDim,  label: "Trial"     },
    active:    { color: C.green,   bg: C.greenDim,   label: "Active"    },
    expired:   { color: C.red,     bg: C.redDim,     label: "Expired"   },
    suspended: { color: C.purple,  bg: C.purpleDim,  label: "Suspended" },
  }[status] ?? { color: C.textSecondary, bg: "transparent", label: status };

  return (
    <Chip
      label={config.label}
      size="small"
      sx={{
        backgroundColor: config.bg,
        color:           config.color,
        border:          `1px solid ${config.color}30`,
        fontFamily:      FONT,
        fontWeight:      700,
        fontSize:        "0.65rem",
        height:          22,
        letterSpacing:   "0.05em",
      }}
    />
  );
}