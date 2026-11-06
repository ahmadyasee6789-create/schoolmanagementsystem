export default function SchoolixMark({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 84 84" fill="none" aria-hidden="true">
    <rect width="60" height="60" rx="14" fill="#8B6DF2" />
    <rect x="24" y="24" width="60" height="60" rx="14" fill="#8B6DF2" opacity="0.35" />
  </svg>;
}
