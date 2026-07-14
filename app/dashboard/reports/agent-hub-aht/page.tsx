import AgentIntervalReportPage from "@/components/AgentIntervalReportPage";

export default function AgentHubAhtPage() {
  return (
    <AgentIntervalReportPage
      metric="HubAHT"
      title="Agent HUB AHT"
      description="Hub Average Handle Time by agent and hour interval. Lower is better."
    />
  );
}
