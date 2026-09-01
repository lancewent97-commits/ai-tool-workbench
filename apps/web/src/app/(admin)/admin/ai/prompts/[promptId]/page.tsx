import { AdminPlannedFeaturePage } from "@/features/admin/planned-feature-page";

export default async function Page({ params }: { params: Promise<{ promptId: string }> }) {
  await params;
  return <AdminPlannedFeaturePage title="Prompt 编辑" description="Prompt 在线编辑、评测和回滚尚未接通。"/>;
}
