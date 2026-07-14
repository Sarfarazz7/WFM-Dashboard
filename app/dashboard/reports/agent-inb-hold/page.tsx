import AgentIntervalReportPage from "@/components/AgentIntervalReportPage";

export default function AgentInbHoldPage() {
  return (
    <AgentIntervalReportPage
      metric="InbHold"
      title="Agent INB Hold"
      description="Inbound Average Hold Time by agent and hour interval. Lower is better."
    />
  );
}
