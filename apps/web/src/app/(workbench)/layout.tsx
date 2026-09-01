import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchProvider } from "@/lib/workbench-store";

export default function WorkbenchLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <WorkbenchProvider><WorkbenchShell>{children}</WorkbenchShell></WorkbenchProvider>;
}
