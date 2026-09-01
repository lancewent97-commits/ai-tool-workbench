import { AdminShell } from "@/components/admin/admin-shell";
import { WorkbenchProvider } from "@/lib/workbench-store";

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <WorkbenchProvider><AdminShell>{children}</AdminShell></WorkbenchProvider>;
}
