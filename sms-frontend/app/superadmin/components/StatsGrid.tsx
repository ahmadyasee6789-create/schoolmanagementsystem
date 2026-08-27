// app/superadmin/components/StatsGrid.tsx
import { Grid } from "@mui/material";
import {
  BusinessOutlined, AccessTimeOutlined,
  CheckCircleOutlined, WarningAmberOutlined,
  BlockOutlined,
} from "@mui/icons-material";
import { C } from "../constants";
import { StatCard } from "./StatCard";
import type { Stats } from "../types";

export function StatsGrid({ stats }: { stats: Stats }) {
  const cards = [
    { label: "Total Orgs", value: stats.total,     color: C.textPrimary, icon: BusinessOutlined,     delay: 0   },
    { label: "On Trial",   value: stats.trial,     color: C.accent,      icon: AccessTimeOutlined,   delay: 60  },
    { label: "Active",     value: stats.active,    color: C.green,       icon: CheckCircleOutlined,  delay: 120 },
    { label: "Expired",    value: stats.expired,   color: C.red,         icon: WarningAmberOutlined, delay: 180 },
    { label: "Suspended",  value: stats.suspended, color: C.purple,      icon: BlockOutlined,        delay: 240 },
  ];

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {cards.map((s) => (
        <Grid item xs={6} sm={4} md key={s.label}>
          <StatCard {...s} />
        </Grid>
      ))}
    </Grid>
  );
}