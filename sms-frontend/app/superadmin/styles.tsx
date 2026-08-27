// app/superadmin/styles.ts
import { C, FONT } from "./constants";

// Used by search/status filter fields in FilterBar
export const inputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: C.surface,
    borderRadius:    "10px",
    fontFamily:      FONT,
    color:           C.textPrimary,
    fontSize:        "0.82rem",
    "& fieldset":             { borderColor: C.border },
    "&:hover fieldset":       { borderColor: C.accent },
    "&.Mui-focused fieldset": { borderColor: C.accent },
  },
  "& .MuiInputLabel-root": {
    color:      C.textSecondary,
    fontFamily: FONT,
    fontSize:   "0.8rem",
    "&.Mui-focused": { color: C.accent },
  },
};

// Used by fields inside dialogs (slightly darker background than the card)
export const dialogInputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "#0a0f1a",
    borderRadius:    "8px",
    fontFamily:      FONT,
    color:           C.textPrimary,
    fontSize:        "0.85rem",
    "& fieldset":             { borderColor: C.border },
    "&:hover fieldset":       { borderColor: C.accent },
    "&.Mui-focused fieldset": { borderColor: C.accent },
  },
  "& .MuiInputLabel-root": {
    color:      C.textSecondary,
    fontFamily: FONT,
    fontSize:   "0.8rem",
    "&.Mui-focused": { color: C.accent },
  },
};

export const thSx = {
  backgroundColor: C.bg,
  color:           C.textSecondary,
  fontSize:        "0.62rem",
  fontWeight:      700,
  textTransform:   "uppercase" as const,
  letterSpacing:   "0.1em",
  borderBottom:    `1px solid ${C.border}`,
  fontFamily:      FONT,
  padding:         "10px 16px",
  whiteSpace:      "nowrap" as const,
};

export const tdSx = {
  borderBottom: `1px solid ${C.border}10`,
  color:        C.textPrimary,
  fontSize:     "0.8rem",
  fontFamily:   FONT,
  padding:      "14px 16px",
};

export const actionBtnSx = (color: string) => ({
  color,
  border:        `1px solid ${color}30`,
  borderRadius:  "7px",
  p:             0.75,
  "&:hover":     { backgroundColor: `${color}15`, borderColor: color },
  "&.Mui-disabled": { opacity: 0.4 },
  transition:    "all 0.15s",
});

export const fadeUp = {
  "@keyframes fadeUp": {
    from: { opacity: 0, transform: "translateY(8px)" },
    to:   { opacity: 1, transform: "translateY(0)" },
  },
};

export const spin = {
  "@keyframes spin": { to: { transform: "rotate(360deg)" } },
};