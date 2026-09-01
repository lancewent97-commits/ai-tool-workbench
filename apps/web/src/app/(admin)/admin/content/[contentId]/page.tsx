import { AdminPlannedFeaturePage } from "@/features/admin/planned-feature-page";

export default async function Page({ params }: { params: Promise<{ contentId: string }> }) {
  await params;
  return <AdminPlannedFeaturePage title="内容编辑" description="真实内容草稿与版本存储尚未接通。"/>;
}
