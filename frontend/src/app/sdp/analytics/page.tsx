import { redirect } from "next/navigation";

// Analytics moved to Insights (the Overview is now Today, for staff).
export default function AnalyticsRedirect() {
  redirect("/sdp/insights");
}
