import { NextRequest, NextResponse } from "next/server";
import {
  cachedJson,
  errorJson,
  requireDashboardAuth,
} from "@/lib/api/dashboardApi";
import {
  createReportSchedule,
  deleteReportSchedule,
  listReportSchedules,
  updateReportScheduleStatus,
  type ReportFormat,
  type ReportType,
} from "@/lib/services/reportCenter";

const VALID_REPORT_TYPES = ["daily", "weekly", "monthly", "agent", "team", "shrinkage", "attendance"];
const VALID_FORMATS = ["csv", "xlsx", "pdf"];
const VALID_FREQUENCIES = ["daily", "weekly", "monthly"];
const VALID_STATUSES = ["active", "paused"];

export async function GET(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    return cachedJson({ rows: await listReportSchedules() }, {}, 10);
  } catch (error) {
    return errorJson(error);
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    if (!body.emailTo || typeof body.emailTo !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.emailTo)) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }
    if (!VALID_REPORT_TYPES.includes(body.reportType)) {
      return NextResponse.json({ error: `Invalid report type. Must be one of: ${VALID_REPORT_TYPES.join(", ")}` }, { status: 400 });
    }
    if (!VALID_FORMATS.includes(body.format)) {
      return NextResponse.json({ error: `Invalid format. Must be one of: ${VALID_FORMATS.join(", ")}` }, { status: 400 });
    }
    if (!VALID_FREQUENCIES.includes(body.frequency)) {
      return NextResponse.json({ error: `Invalid frequency. Must be one of: ${VALID_FREQUENCIES.join(", ")}` }, { status: 400 });
    }

    const schedule = await createReportSchedule({
      reportType: body.reportType as ReportType,
      format: body.format as ReportFormat,
      frequency: body.frequency,
      emailTo: body.emailTo,
      filters: body.filters ?? {},
    });

    return cachedJson({ schedule }, { status: 201 }, 0);
  } catch (error) {
    return errorJson(error);
  }
}

export async function PATCH(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    if (!body.scheduleId || !body.status) {
      return NextResponse.json(
        { error: "scheduleId and status are required" },
        { status: 400 }
      );
    }
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    await updateReportScheduleStatus(body.scheduleId, body.status);
    return cachedJson({ ok: true }, {}, 0);
  } catch (error) {
    return errorJson(error);
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const scheduleId = request.nextUrl.searchParams.get("scheduleId");
    if (!scheduleId) {
      return NextResponse.json(
        { error: "scheduleId is required" },
        { status: 400 }
      );
    }

    await deleteReportSchedule(scheduleId);
    return cachedJson({ ok: true }, {}, 0);
  } catch (error) {
    return errorJson(error);
  }
}
