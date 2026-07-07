"use client";

import { useState, useEffect } from "react";
import ReportBuilder from "@/components/report-center/ReportBuilder";
import ReportPreview from "@/components/report-center/ReportPreview";
import ReportHistory from "@/components/report-center/ReportHistory";
import DownloadCenter from "@/components/report-center/DownloadCenter";
import EmailScheduleForm from "@/components/report-center/EmailScheduleForm";

type Tab = "generate" | "history" | "downloads" | "schedules";

const TABS: Array<{ id: Tab; label: string; desc: string }> = [
  { id: "generate", label: "Generate", desc: "Create and export reports" },
  { id: "history", label: "History", desc: "Past report exports" },
  { id: "downloads", label: "Downloads", desc: "Available report files" },
  { id: "schedules", label: "Schedules", desc: "Email delivery setup" },
];

const PREVIEW_TYPES = ["daily", "weekly", "monthly", "agent", "team", "shrinkage", "attendance"];

export default function ReportCenterPage() {
  const [activeTab, setActiveTab] = useState<Tab>("generate");
  const [previewType, setPreviewType] = useState("daily");
  const [previewDateFrom, setPreviewDateFrom] = useState("");
  const [previewDateTo, setPreviewDateTo] = useState("");

  useEffect(() => {
    setPreviewDateFrom(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
    setPreviewDateTo(new Date().toISOString().slice(0, 10));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-display font-semibold text-mist-50">Report Center</h1>
        <p className="mt-1 text-sm text-mist-400">
          Generate, schedule, and download operational reports in PDF, Excel, or CSV.
        </p>
      </div>

      <div role="tablist" aria-label="Report center sections" className="flex gap-1 border-b border-ink-600">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-b-2 border-blue-500 text-blue-400"
                : "text-mist-400 hover:text-mist-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "generate" && (
        <div role="tabpanel" id="tabpanel-generate" aria-labelledby="tab-generate" className="space-y-5">
          <ReportBuilder />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <div className="flex gap-2 items-center" role="group" aria-label="Preview data type">
                <span className="text-xs text-mist-400">Preview data for:</span>
                {PREVIEW_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setPreviewType(type)}
                    aria-pressed={previewType === type}
                    className={`text-xs px-2 py-1 rounded capitalize ${
                      previewType === type
                        ? "bg-blue-600/20 text-blue-300 border border-blue-500/40"
                        : "text-mist-400 hover:text-mist-200 border border-transparent"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <ReportPreview
                reportType={previewType}
                dateFrom={previewDateFrom}
                dateTo={previewDateTo}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div role="tabpanel" id="tabpanel-history" aria-labelledby="tab-history">
          <ReportHistory />
        </div>
      )}
      {activeTab === "downloads" && (
        <div role="tabpanel" id="tabpanel-downloads" aria-labelledby="tab-downloads">
          <DownloadCenter />
        </div>
      )}
      {activeTab === "schedules" && (
        <div role="tabpanel" id="tabpanel-schedules" aria-labelledby="tab-schedules">
          <EmailScheduleForm />
        </div>
      )}
    </div>
  );
}
