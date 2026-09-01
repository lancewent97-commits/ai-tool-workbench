import { ReturnDetail } from "@/features/me/personal-pages";

export default async function Page({params}:{params:Promise<{returnId:string}>}){ const {returnId}=await params;return <ReturnDetail returnId={returnId}/>; }
