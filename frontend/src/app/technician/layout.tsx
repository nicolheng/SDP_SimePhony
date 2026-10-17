import { MobileFrame } from "@/components/mobile";
import { TechNav } from "./tech-nav";

export default function TechnicianLayout({ children }: LayoutProps<"/technician">) {
  return (
    <MobileFrame role="Technician" nav={<TechNav />}>
      {children}
    </MobileFrame>
  );
}
