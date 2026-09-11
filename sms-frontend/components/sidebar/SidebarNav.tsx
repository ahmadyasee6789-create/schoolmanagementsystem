"use client";

import { useState } from "react";
import { navigation, sectionIcons } from "@/constants/navigation";
import SidebarSection from "./SidebarSection";

interface SidebarNavProps {
  pathname: string;
  collapsed: boolean;
}

export default function SidebarNav({ pathname, collapsed }: SidebarNavProps) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const sections = [...new Set(navigation.map((item) => item.section))];

  const toggle = (title: string) =>
    setOpenSection((prev) => (prev === title ? null : title));

  return (
    <nav
      className={`flex-1 overflow-y-auto py-2 ${collapsed ? "px-0" : "px-2"}`}
      style={{ scrollbarWidth: "none" }}
    >
      {sections.map((section) => (
        <SidebarSection
          key={section}
          title={section}
          icon={sectionIcons[section]}
          items={navigation.filter((item) => item.section === section)}
          pathname={pathname}
          collapsed={collapsed}
          isOpen={openSection === section}
          onToggle={() => toggle(section)}
        />
      ))}
    </nav>
  );
}