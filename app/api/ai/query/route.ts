import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/services/ai/questionAnswerer";
import {
  requireDashboardAuth,
  errorJson,
} from "@/lib/api/dashboardApi";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";

    if (!question) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    const result = await answerQuestion(question, {
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      lob: body.lob,
    });

    return NextResponse.json({
      answer: result.answer,
      tokensUsed: result.tokensUsed,
    });
  } catch (error) {
    return errorJson(error);
  }
}
