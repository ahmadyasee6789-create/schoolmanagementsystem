// app/superadmin/components/OrganizationsTable.tsx
import {
  Box, IconButton, Table, TableBody, TableCell,
  TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import {
  AttachMoneyOutlined, BlockOutlined, PeopleOutlined, RefreshOutlined,
} from "@mui/icons-material";
import { C, FONT } from "../constants";
import { actionBtnSx, tdSx, thSx } from "../styles";
import { fmtDate } from "../helpers";
import { StatusChip } from "./StatusChip";
import { PlanChip } from "./PlanChip";
import type { Organization } from "../types";

const COLUMNS = ["Organization", "Admin", "Plan", "Status", "Days Left", "Members", "Created", "Actions"];

export function OrganizationsTable({
  orgs, actionLoadingId, onActivate, onSuspend, onReactivate,
}: {
  orgs:            Organization[];
  actionLoadingId: number | null;
  onActivate:      (org: Organization) => void;
  onSuspend:       (org: Organization) => void;
  onReactivate:    (org: Organization) => void;
}) {
  return (
    <Box sx={{
      backgroundColor: C.surface,
      border:          `1px solid ${C.border}`,
      borderRadius:    "14px",
      overflow:        "hidden",
    }}>
      <Table>
        <TableHead>
          <TableRow>
            {COLUMNS.map((h) => (
              <TableCell key={h} sx={thSx}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>

        <TableBody>
          {orgs.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={COLUMNS.length}
                sx={{ textAlign: "center", py: 8, color: C.textSecondary, fontFamily: FONT, fontSize: "0.82rem" }}
              >
                No organizations found.
              </TableCell>
            </TableRow>
          ) : (
            orgs.map((org, i) => (
              <OrganizationRow
                key={org.id}
                org={org}
                index={i}
                loading={actionLoadingId === org.id}
                onActivate={onActivate}
                onSuspend={onSuspend}
                onReactivate={onReactivate}
              />
            ))
          )}
        </TableBody>
      </Table>
    </Box>
  );
}

function OrganizationRow({
  org, index, loading, onActivate, onSuspend, onReactivate,
}: {
  org:          Organization;
  index:        number;
  loading:      boolean;
  onActivate:   (org: Organization) => void;
  onSuspend:    (org: Organization) => void;
  onReactivate: (org: Organization) => void;
}) {
  return (
    <TableRow
      sx={{
        "&:hover":  { backgroundColor: C.surfaceHover },
        transition: "background 0.15s",
        animation:  `rowFadeUp 0.3s ${index * 20}ms ease both`,
        "@keyframes rowFadeUp": {
          from: { opacity: 0, transform: "translateY(4px)" },
          to:   { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      <TableCell sx={tdSx}>
        <Typography sx={{ fontWeight: 700, color: C.textPrimary, fontFamily: FONT, fontSize: "0.85rem" }}>
          {org.name}
        </Typography>
        <Typography sx={{ fontSize: "0.65rem", color: C.textMuted, fontFamily: FONT }}>
          #{org.id}
        </Typography>
      </TableCell>

      <TableCell sx={tdSx}>
        <Typography sx={{ fontSize: "0.8rem", color: C.textPrimary, fontFamily: FONT }}>
          {org.admin_name}
        </Typography>
        <Typography sx={{ fontSize: "0.68rem", color: C.textSecondary, fontFamily: FONT }}>
          {org.admin_email}
        </Typography>
      </TableCell>

      <TableCell sx={tdSx}>
        <PlanChip plan={org.plan} />
      </TableCell>

      <TableCell sx={tdSx}>
        <StatusChip status={org.status} />
      </TableCell>

      <TableCell sx={tdSx}>
        {org.days_left !== null ? (
          <Typography sx={{
            fontFamily: FONT,
            fontSize:   "0.82rem",
            fontWeight: 700,
            color:      org.days_left <= 3 ? C.red : org.days_left <= 7 ? C.accent : C.green,
          }}>
            {org.days_left === 0 ? "Expired" : `${org.days_left}d`}
          </Typography>
        ) : (
          <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem", color: C.textMuted }}>—</Typography>
        )}
      </TableCell>

      <TableCell sx={tdSx}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <PeopleOutlined sx={{ fontSize: 13, color: C.textSecondary }} />
          <Typography sx={{ fontFamily: FONT, fontSize: "0.82rem" }}>
            {org.member_count}
          </Typography>
        </Box>
      </TableCell>

      <TableCell sx={{ ...tdSx, color: C.textSecondary, fontSize: "0.75rem" }}>
        {fmtDate(org.created_at)}
      </TableCell>

      <TableCell sx={tdSx}>
        <Box sx={{ display: "flex", gap: 0.75 }}>
          <Tooltip title={org.status === "active" ? "Extend Plan" : "Activate"} arrow>
            <span>
              <IconButton
                size="small"
                disabled={loading}
                onClick={() => onActivate(org)}
                sx={actionBtnSx(C.green)}
              >
                <AttachMoneyOutlined sx={{ fontSize: 15 }} />
              </IconButton>
            </span>
          </Tooltip>

          {(org.status === "active" || org.status === "trial") && (
            <Tooltip title="Suspend" arrow>
              <span>
                <IconButton
                  size="small"
                  disabled={loading}
                  onClick={() => onSuspend(org)}
                  sx={actionBtnSx(C.red)}
                >
                  <BlockOutlined sx={{ fontSize: 15 }} />
                </IconButton>
              </span>
            </Tooltip>
          )}

          {(org.status === "suspended" || org.status === "expired") && (
            <Tooltip title="Reactivate" arrow>
              <span>
                <IconButton
                  size="small"
                  disabled={loading}
                  onClick={() => onReactivate(org)}
                  sx={actionBtnSx(C.accent)}
                >
                  <RefreshOutlined sx={{ fontSize: 15 }} />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      </TableCell>
    </TableRow>
  );
}