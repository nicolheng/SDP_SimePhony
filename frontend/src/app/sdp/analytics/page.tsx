import { redirect } from "next/navigation";

// Analytics is now a tab on the Overview; systemic detection and the heatmap moved to Systemic Issues.
export default function AnalyticsRedirect() {
  redirect("/sdp?tab=analytics");
}
