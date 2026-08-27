// app/superadmin/components/ActivateDialog.tsx
import { useState } from "react";
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, MenuItem, TextField, Typography,
} from "@mui/material";
import { CloseOutlined } from "@mui/icons-material";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { C, FONT } from "../constants";
import { dialogInputSx } from "../styles";
import { getErrorMessage } from "../helpers";
import type { Organization } from "../types";

const PLANS = ["basic", "standard", "premium"];

export function ActivateDialog({
  open, org, onClose, onSuccess,
}: {
  open:      boolean;
  org:       Organization | null;
  onClose:   () => void;
  onSuccess: () => void;
}) {
  const [plan,   setPlan]   = useState("basic");
  const [days,   setDays]   = useState(30);
  const [saving, setSaving] = useState(false);

  async function handleActivate() {
    if (!org) return;
    setSaving(true);
    try {
      await api.post(`/superadmin/organizations/${org.id}/activate`, { plan, days });
      toast.success(`${org.name} activated on ${plan} plan for ${days} days!`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to activate"));
    } finally {
      setSaving(false);
    }
  }

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
        Activate Organization
        <IconButton size="small" onClick={onClose} sx={{ color: C.textSecondary }}>
          <CloseOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Box sx={{
          backgroundColor: C.accentDim,
          border:          `1px solid ${C.accent}30`,
          borderRadius:    "10px",
          p:               2,
          mb:              2.5,
        }}>
          <Typography sx={{ fontFamily: FONT, fontSize: "0.7rem", color: C.accent, mb: 0.5 }}>
            ORGANIZATION
          </Typography>
          <Typography sx={{ fontFamily: FONT, fontSize: "0.95rem", fontWeight: 700, color: C.textPrimary }}>
            {org?.name}
          </Typography>
          <Typography sx={{ fontFamily: FONT, fontSize: "0.72rem", color: C.textSecondary }}>
            {org?.admin_email}
          </Typography>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              select fullWidth size="small"
              label="Select Plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              sx={dialogInputSx}
            >
              {PLANS.map((p) => (
                <MenuItem key={p} value={p}>
                  <Typography sx={{ fontFamily: FONT, fontSize: "0.85rem", textTransform: "capitalize" }}>
                    {p}
                  </Typography>
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth size="small"
              type="number"
              label="Active for (days)"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              inputProps={{ min: 1, max: 365 }}
              sx={dialogInputSx}
              helperText={`Expires: ${new Date(Date.now() + days * 86400000).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}`}
              FormHelperTextProps={{ sx: { fontFamily: FONT, fontSize: "0.7rem", color: C.textSecondary } }}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ borderTop: `1px solid ${C.border}`, px: 3, py: 2, gap: 1 }}>
        <Button
          onClick={onClose}
          sx={{ color: C.textSecondary, fontFamily: FONT, textTransform: "none", fontSize: "0.8rem" }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleActivate}
          disabled={saving || !org}
          sx={{
            backgroundColor: C.green,
            color:           "#fff",
            fontFamily:      FONT,
            fontWeight:      700,
            textTransform:   "none",
            borderRadius:    "8px",
            fontSize:        "0.82rem",
            "&:hover":       { backgroundColor: "#0da271" },
            "&.Mui-disabled": { backgroundColor: `${C.green}40`, color: "#fff6" },
          }}
        >
          {saving ? "Activating…" : `Activate — ${plan} / ${days}d`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}