import { redirect } from "next/navigation";
import { ConnectedTaskWorkspace } from "@/features/ai-packaging/task-workspace/connected-task-workspace";

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { taskId } = await params;
  const { mode } = await searchParams;

  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(taskId)) redirect("/");
  return <ConnectedTaskWorkspace conversationId={taskId} mode={mode} />;
}
