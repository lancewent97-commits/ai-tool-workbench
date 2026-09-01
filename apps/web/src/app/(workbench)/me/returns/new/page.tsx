import { ReturnNew } from "@/features/me/personal-pages";
import { Suspense } from "react";

export default function Page(){ return <Suspense fallback={null}><ReturnNew/></Suspense>; }
