import { redirect } from "next/navigation";

// Open straight on the SDP dashboard; switch roles with the dropdown on every view.
export default function Home() {
  redirect("/sdp");
}
