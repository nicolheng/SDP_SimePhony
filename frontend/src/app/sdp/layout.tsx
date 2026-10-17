import { Suspense } from "react";
import { SdpSidebar } from "./sidebar";

export default function SdpLayout({ children }: LayoutProps<"/sdp">) {
  return (
    <div className="flex min-h-dvh flex-1 bg-zinc-50">
      <Suspense fallback={<aside className="hidden w-60 shrink-0 bg-ink lg:block" />}>
        <SdpSidebar />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 pb-8 pt-20 sm:px-8 lg:pt-6">{children}</main>
    </div>
  );
}
