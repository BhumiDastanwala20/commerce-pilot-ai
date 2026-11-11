import DashNav from "@/components/DashNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashNav />
      {children}
    </>
  );
}