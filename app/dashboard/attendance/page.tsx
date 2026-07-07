import EnterpriseDashboardPage from "@/components/enterprise/EnterpriseDashboardPage";

export default function AttendancePage() {
  return (
    <EnterpriseDashboardPage
      kind="attendance"
      title="Attendance"
      description="Attendance, present count, schedule coverage, and staffing source rows."
    />
  );
}
