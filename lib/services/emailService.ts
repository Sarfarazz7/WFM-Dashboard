import { Resend } from "resend";

let resendClient: Resend | null = null;

function getClient(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export interface SendReportEmailParams {
  to: string;
  reportType: string;
  format: string;
  fileName: string;
  buffer: Buffer;
  contentType: string;
  dateRange?: { from?: string; to?: string };
}

export async function sendReportEmail(params: SendReportEmailParams): Promise<{ id: string }> {
  const client = getClient();

  const dateInfo = params.dateRange?.from
    ? ` for ${params.dateRange.from}${params.dateRange.to ? ` to ${params.dateRange.to}` : ""}`
    : "";

  const subject = `WFM ${params.reportType.charAt(0).toUpperCase() + params.reportType.slice(1)} Report${dateInfo}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: #1e293b; padding: 20px 24px; }
    .header h1 { color: #e2e8f0; margin: 0; font-size: 18px; }
    .header p { color: #94a3b8; margin: 4px 0 0; font-size: 13px; }
    .body { padding: 24px; }
    .body p { color: #475569; line-height: 1.6; margin: 0 0 12px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-pdf { background: #fee2e2; color: #dc2626; }
    .badge-xlsx { background: #dcfce7; color: #16a34a; }
    .badge-csv { background: #dbeafe; color: #2563eb; }
    .footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
    .footer p { color: #94a3b8; font-size: 11px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>WFM Report Delivery</h1>
      <p>${params.reportType.charAt(0).toUpperCase() + params.reportType.slice(1)} Report</p>
    </div>
    <div class="body">
      <p>Your scheduled <strong>${params.reportType}</strong> report is attached as a <span class="badge badge-${params.format}">${params.format.toUpperCase()}</span> file.</p>
      <p><strong>File:</strong> ${params.fileName}</p>
      ${params.dateRange?.from ? `<p><strong>Date Range:</strong> ${params.dateRange.from} to ${params.dateRange.to ?? "present"}</p>` : ""}
    </div>
    <div class="footer">
      <p>Automated report from WFM Breaksheet Dashboard</p>
    </div>
  </div>
</body>
</html>`;

  const { data, error } = await client.emails.send({
    from: "WFM Reports <reports@resend.dev>",
    to: [params.to],
    subject,
    html: htmlBody,
    attachments: [
      {
        filename: params.fileName,
        content: params.buffer.toString("base64"),
      },
    ],
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return { id: data?.id ?? "unknown" };
}
