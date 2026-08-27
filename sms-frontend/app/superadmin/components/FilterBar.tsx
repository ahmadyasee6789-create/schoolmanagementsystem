// app/superadmin/components/FilterBar.tsx
import { Box, IconButton, MenuItem, TextField, Tooltip, Typography } from "@mui/material";
import { RefreshOutlined } from "@mui/icons-material";
import { C, FONT } from "../constants";
import { inputSx, spin } from "../styles";

const STATUS_OPTIONS = ["all", "trial", "active", "expired", "suspended"];

export function FilterBar({
  searchText, onSearchChange,
  filterStatus, onFilterChange,
  onRefresh, loading, resultCount,
}: {
  searchText:     string;
  onSearchChange: (v: string) => void;
  filterStatus:   string;
  onFilterChange: (v: string) => void;
  onRefresh:      () => void;
  loading:        boolean;
  resultCount:    number;
}) {
  return (
    <Box sx={{ display: "flex", gap: 2, mb: 2.5, flexWrap: "wrap", alignItems: "center" }}>
      <TextField
        size="small"
        placeholder="Search by org name or admin email…"
        value={searchText}
        onChange={(e) => onSearchChange(e.target.value)}
        sx={{ ...inputSx, flex: 1, minWidth: 220 }}
      />

      <TextField
        select size="small"
        label="Status"
        value={filterStatus}
        onChange={(e) => onFilterChange(e.target.value)}
        sx={{ ...inputSx, width: 160 }}
      >
        {STATUS_OPTIONS.map((s) => (
          <MenuItem key={s} value={s}>
            <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", textTransform: "capitalize" }}>
              {s === "all" ? "All Status" : s}
            </Typography>
          </MenuItem>
        ))}
      </TextField>

      <Tooltip title="Refresh" arrow>
        <span>
          <IconButton
            onClick={onRefresh}
            disabled={loading}
            sx={{
              color:        C.accent,
              border:       `1px solid ${C.accent}30`,
              borderRadius: "10px",
              p:            1,
              "&:hover":    { backgroundColor: C.accentDim },
              animation:    loading ? "spin 1s linear infinite" : "none",
              ...spin,
            }}
          >
            <RefreshOutlined sx={{ fontSize: 18 }} />
          </IconButton>
        </span>
      </Tooltip>

      <Typography sx={{ fontFamily: FONT, fontSize: "0.72rem", color: C.textSecondary, ml: "auto" }}>
        {resultCount} organization{resultCount !== 1 ? "s" : ""}
      </Typography>
    </Box>
  );
}