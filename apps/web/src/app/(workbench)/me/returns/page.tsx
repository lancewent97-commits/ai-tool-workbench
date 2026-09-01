import { MyReturns } from "@/features/me/personal-pages";
import { Suspense } from "react";

export default function Page(){ return <Suspense fallback={null}><MyReturns/></Suspense>; }
