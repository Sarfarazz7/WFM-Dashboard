import AgentIntervalReportPage from "@/components/AgentIntervalReportPage";

export default function AgentInbAhtPage() {
  return (
    <AgentIntervalReportPage
      metric="InbAHT"
      title="Agent INB AHT"
      description="Inbound Average Handle Time by agent and hour interval. Lower is better."
    />
  );
}
