// app/organization/invitations/accept/layout.tsx
import { ReactNode } from "react";

export default function AcceptInviteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {/* No dashboard sidebar, no auth redirect */}
      {children}
    </>
  );
}
