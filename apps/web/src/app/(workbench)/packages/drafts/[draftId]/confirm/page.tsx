import { PackageConfirm } from "@/features/packages/package-pages";
export default async function PackageConfirmPage({params}:{params:Promise<{draftId:string}>}){const {draftId}=await params;return <PackageConfirm draftId={draftId}/>}
