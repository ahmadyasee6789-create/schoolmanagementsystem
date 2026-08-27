// app/superadmin/types.ts
export type OrgStatus = "trial" | "active" | "expired" | "suspended";

export type Organization = {
  id:            number;
  name:          string;
  status:        OrgStatus;
  plan:          string;
  trial_ends_at: string | null;
  created_at:    string;
  member_count:  number;
  admin_name:    string;
  admin_email:   string;
  days_left:     number | null;
};

export type Stats = {
  total:     number;
  trial:     number;
  active:    number;
  expired:   number;
  suspended: number;
};