import { AdminPlannedFeaturePage } from "@/features/admin/planned-feature-page";

export default async function Page({ params }: { params: Promise<{ changeId: string }> }) {
  await params;
  return <AdminPlannedFeaturePage title="变更详情" description="统一字段级变更记录尚未接通真实数据。"/>;
}
