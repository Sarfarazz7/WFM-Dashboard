import ExcelUploader from "@/components/ExcelUploader";
import Link from "next/link";

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-ink-950">
      <header className="border-b border-ink-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-display font-semibold">Upload Breaksheet</h1>
        <Link href="/dashboard" className="btn-secondary text-sm">
          Go to dashboard
        </Link>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">
        <ExcelUploader />
      </main>
    </div>
  );
}
