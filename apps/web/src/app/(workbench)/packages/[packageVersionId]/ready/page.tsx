import { DownloadReady } from "@/features/packages/package-pages";
export default async function PackageReadyPage({params}:{params:Promise<{packageVersionId:string}>}){const {packageVersionId}=await params;return <DownloadReady packageVersionId={packageVersionId}/>}
