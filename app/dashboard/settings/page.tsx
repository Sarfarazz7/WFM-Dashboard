import EnterpriseDashboardPage from "@/components/enterprise/EnterpriseDashboardPage";

export default function SettingsPage() {
  return (
    <EnterpriseDashboardPage
      kind="settings"
      title="Settings"
      description="Upload status, data freshness, and API-backed system checks."
    />
  );
}
