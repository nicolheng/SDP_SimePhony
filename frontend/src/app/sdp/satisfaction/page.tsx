import { redirect } from "next/navigation";

// Ratings is now a tab on the Overview.
export default function RatingsRedirect() {
  redirect("/sdp?tab=ratings");
}
