import { ToolDetail } from "@/features/tools/tool-pages";
export default async function ToolDetailPage({params}:{params:Promise<{toolId:string}>}){const {toolId}=await params;return <ToolDetail toolId={toolId}/>}
