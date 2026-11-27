import { redirect } from "next/navigation";

// Open straight on SDP's Approvals (decisions waiting on staff); switch roles with the dropdown on every view.
export default function Home() {
  redirect("/sdp/approvals");
}
