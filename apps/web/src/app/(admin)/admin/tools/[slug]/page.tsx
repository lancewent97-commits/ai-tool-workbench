import { AdminToolDetailPage } from "@/features/admin/tool-management-pages";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <AdminToolDetailPage slug={slug}/>;
}
