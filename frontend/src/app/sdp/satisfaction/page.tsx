import { redirect } from "next/navigation";

// Ratings is a detail view of Insights.
export default function RatingsRedirect() {
  redirect("/sdp/insights?tab=ratings");
}
