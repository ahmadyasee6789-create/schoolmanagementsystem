// app/superadmin/components/PlanChip.tsx
import { Chip } from "@mui/material";
import { C, FONT } from "../constants";

export function PlanChip({ plan }: { plan: string }) {
  const config: Record<string, { color: string; bg: string }> = {
    trial:    { color: C.accent, bg: C.accentDim  },
    basic:    { color: C.blue,   bg: C.blueDim    },
    standard: { color: C.green,  bg: C.greenDim   },
    premium:  { color: C.purple, bg: C.purpleDim  },
  };
  const c = config[plan] ?? { color: C.textSecondary, bg: "transparent" };

  return (
    <Chip
      label={plan.toUpperCase()}
      size="small"
      sx={{
        backgroundColor: c.bg,
        color:           c.color,
        border:          `1px solid ${c.color}30`,
        fontFamily:      FONT,
        fontWeight:      700,
        fontSize:        "0.6rem",
        height:          20,
        letterSpacing:   "0.08em",
      }}
    />
  );
}