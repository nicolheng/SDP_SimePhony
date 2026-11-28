import { redirect } from "next/navigation";

// Analytics moved to Insights (the Overview is now Actions, for staff).
export default function AnalyticsRedirect() {
  redirect("/sdp/insights");
}
