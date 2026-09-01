import { AdminPlannedFeaturePage } from "@/features/admin/planned-feature-page";

export default async function Page({ params }: { params: Promise<{ logId: string }> }) {
  await params;
  return <AdminPlannedFeaturePage title="日志详情" description="当前操作日志列表是真实数据；单条详情接口接通后再开放。"/>;
}
