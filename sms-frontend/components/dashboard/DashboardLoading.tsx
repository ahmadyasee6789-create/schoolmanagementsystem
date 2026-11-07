export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading dashboard" className="flex h-[60vh] items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#F59E0B]/15 border-t-[#F59E0B]" />
    </div>
  );
}
