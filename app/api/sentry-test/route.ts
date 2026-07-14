export const dynamic = "force-dynamic";

export async function GET() {
  throw new Error("Sentry test error from API route — delete this route after verifying");
}
