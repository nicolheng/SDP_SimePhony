import { redirect } from "next/navigation";

// Open straight on SDP's Today page; switch roles with the dropdown on every view.
export default function Home() {
  redirect("/sdp");
}
