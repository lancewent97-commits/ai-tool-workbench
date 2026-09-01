import { ReturnReviewDetailPage } from "@/features/admin/return-review-pages";

export default async function Page({
  params,
}: {
  params: Promise<{ returnId: string }>;
}) {
  const { returnId } = await params;
  return <ReturnReviewDetailPage returnId={returnId} />;
}
