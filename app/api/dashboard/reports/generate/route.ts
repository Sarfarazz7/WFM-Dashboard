import { NextRequest, NextResponse } from "next/server";
import { errorJson, requireDashboardAuth } from "@/lib/api/dashboardApi";
import {
  generateReport,
  recordReportExport,
  type ReportFormat,
  type ReportType,
} from "@/lib/services/reportCenter";

const REPORT_TYPES: ReportType[] = ["daily", "weekly", "monthly", "agent", "team", "shrinkage", "attendance"];
const FORMATS: ReportFormat[] = ["pdf", "xlsx", "csv"];

export async function POST(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const reportType = body.reportType as ReportType;
    const format = body.format as ReportFormat;

    if (!REPORT_TYPES.includes(reportType)) {
      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }
    if (!FORMATS.includes(format)) {
      return NextResponse.json({ error: "Invalid report format" }, { status: 400 });
    }

    const report = await generateReport({
      reportType,
      format,
      filters: {
        dateFrom: body.filters?.dateFrom,
        dateTo: body.filters?.dateTo,
        lob: body.filters?.lob,
        agentName: body.filters?.agentName,
      },
    });

    await recordReportExport({
      reportType,
      format,
      filters: body.filters ?? {},
      fileName: report.fileName,
      rowCount: report.rowCount,
    }).catch(() => {});

    return new NextResponse(new Uint8Array(report.body), {
      headers: {
        "Content-Type": report.contentType,
        "Content-Disposition": `attachment; filename="${report.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorJson(error);
  }
}
