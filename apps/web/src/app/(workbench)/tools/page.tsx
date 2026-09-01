import { Suspense } from "react";
import { ToolWorkbench } from "@/features/tools/tool-pages";
export default function ToolsPage(){return <Suspense fallback={null}><ToolWorkbench/></Suspense>}
