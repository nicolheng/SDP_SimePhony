import { MobileFrame } from "@/components/mobile";
import { BuyerNav } from "./buyer-nav";

export default function BuyerLayout({ children }: LayoutProps<"/buyer">) {
  return (
    <MobileFrame role="Buyer" nav={<BuyerNav />}>
      {children}
    </MobileFrame>
  );
}
