import AgentIntervalReportPage from "@/components/AgentIntervalReportPage";

export default function AgentHubHoldPage() {
  return (
    <AgentIntervalReportPage
      metric="HubHold"
      title="Agent HUB Hold"
      description="Hub Average Hold Time by agent and hour interval. Lower is better."
    />
  );
}
