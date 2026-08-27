// app/superadmin/components/ConfirmDialog.tsx
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Typography,
} from "@mui/material";
import { CloseOutlined, WarningAmberOutlined } from "@mui/icons-material";
import { C, FONT } from "../constants";

export function ConfirmDialog({
  open, title, message, confirmLabel = "Confirm",
  danger = true, loading = false, onConfirm, onClose,
}: {
  open:         boolean;
  title:        string;
  message:      string;
  confirmLabel?: string;
  danger?:      boolean;
  loading?:     boolean;
  onConfirm:    () => void;
  onClose:      () => void;
}) {
  const color = danger ? C.red : C.accent;
  const colorDim = danger ? C.redDim : C.accentDim;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: { backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "16px" },
      }}
    >
      <DialogTitle sx={{
        fontFamily:   FONT,
        fontWeight:   700,
        fontSize:     "0.95rem",
        color:        C.textPrimary,
        borderBottom: `1px solid ${C.border}`,
        pb:           2,
        display:      "flex",
        justifyContent: "space-between",
        alignItems:   "center",
      }}>
        {title}
        <IconButton size="small" onClick={onClose} sx={{ color: C.textSecondary }}>
          <CloseOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Box sx={{
          display:         "flex",
          gap:             1.5,
          alignItems:      "flex-start",
          backgroundColor: colorDim,
          border:          `1px solid ${color}30`,
          borderRadius:    "10px",
          p:               2,
        }}>
          <WarningAmberOutlined sx={{ fontSize: 18, color, mt: "1px", flexShrink: 0 }} />
          <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", color: C.textPrimary, lineHeight: 1.6 }}>
            {message}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ borderTop: `1px solid ${C.border}`, px: 3, py: 2, gap: 1 }}>
        <Button
          onClick={onClose}
          disabled={loading}
          sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: "none", fontSize: "0.8rem" }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={loading}
          sx={{
            backgroundColor: color,
            color:           "#fff",
            fontFamily:      FONT,
            fontWeight:      700,
            textTransform:   "none",
            borderRadius:    "8px",
            fontSize:        "0.82rem",
            "&:hover":       { backgroundColor: color, filter: "brightness(0.9)" },
            "&.Mui-disabled": { backgroundColor: `${color}40`, color: "#fff6" },
          }}
        >
          {loading ? "Working…" : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}