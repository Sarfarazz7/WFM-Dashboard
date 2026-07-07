import type { AnalyticsContext } from "./contextBuilder";

const SYSTEM_BASE = `You are a WFM (Workforce Management) analytics expert for a call center.
Analyze the provided data and give actionable insights.
Be specific with numbers. Keep responses concise and professional.
Use plain text formatting with bullet points where appropriate.`;

export function uploadSummaryPrompt(ctx: import("./contextBuilder").AnalyticsContext): {
  system: string;
  user: string;
} {
  return {
    system: SYSTEM_BASE,
    user: `Generate a 3-5 sentence operational summary for today's call center performance.

Key data:
${summarizeContext(ctx)}

Focus on: call volume, AHT, shrinkage, and any notable agent performance patterns.`,
  };
}

export function anomaliesPrompt(ctx: AnalyticsContext): {
  system: string;
  user: string;
} {
  return {
    system: `${SYSTEM_BASE}
An anomaly is any metric that deviates significantly from the 30-day average (more than 15% difference is notable).
Prioritize actionable anomalies.`,
    user: `Detect anomalies in today's call center data compared to recent trends.

${summarizeContext(ctx)}

For each anomaly found, state:
- Which metric is anomalous
- Today's value vs the average
- Possible causes
- Recommended investigation`,
  };
}

export function topPerformersPrompt(ctx: AnalyticsContext): {
  system: string;
  user: string;
} {
  return {
    system: `${SYSTEM_BASE}
Rank agents by composite performance score considering AHT (lower is better), calls per hour (higher is better), shrinkage (lower is better), and abandonment rate (lower is better).`,
    user: `Identify the top 3 performing agents today. For each:
- Agent name and LOB
- Key metrics (AHT, shrinkage, abandonment, breaks)
- What makes them stand out
- Any recommendations for recognizing or leveraging their performance

${summarizeAgentContext(ctx)}`,
  };
}

export function bottomPerformersPrompt(ctx: AnalyticsContext): {
  system: string;
  user: string;
} {
  return {
    system: `${SYSTEM_BASE}
Focus on coaching opportunities, not punishment. Identify specific areas where agents can improve.`,
    user: `Identify agents who may need coaching or support today. For each:
- Agent name and LOB
- Specific metrics that need attention
- Possible root causes
- Suggested coaching actions

${summarizeAgentContext(ctx)}`,
  };
}

export function yesterdayComparisonPrompt(ctx: AnalyticsContext): {
  system: string;
  user: string;
} {
  return {
    system: `${SYSTEM_BASE}
Compare metrics day-over-day. Highlight significant changes (more than 10% difference).`,
    user: `Compare today's performance with yesterday.

${summarizeContext(ctx)}

For each significant change:
- What changed and by how much
- Whether the change is positive or negative
- Possible reasons for the change`,
  };
}

export function weeklyComparisonPrompt(ctx: AnalyticsContext): {
  system: string;
  user: string;
} {
  return {
    system: `${SYSTEM_BASE}
Compare metrics week-over-week to identify trends and patterns.`,
    user: `Compare today's performance with the same day last week.

${summarizeContext(ctx)}

Identify:
- Overall trend direction (improving, declining, stable)
- Key metrics that changed significantly
- Any emerging patterns that need attention`,
  };
}

export function improvementsPrompt(ctx: AnalyticsContext): {
  system: string;
  user: string;
} {
  return {
    system: `${SYSTEM_BASE}
Provide specific, actionable operational improvements. Each suggestion should be implementable by a WFM team within a day or week.`,
    user: `Based on today's data, suggest 3-5 specific operational improvements.

${summarizeContext(ctx)}

For each suggestion:
- What to do
- Expected impact on metrics
- Priority (high/medium/low)
- Who should take action`,
  };
}

export function executiveSummaryPrompt(ctx: AnalyticsContext): {
  system: string;
  user: string;
} {
  return {
    system: `${SYSTEM_BASE}
Write for a VP/Director audience. Focus on business impact, not technical details.
Keep it to 2-3 short paragraphs.`,
    user: `Write an executive briefing for today's call center operations.

${summarizeContext(ctx)}

Cover:
1. Overall performance snapshot
2. Key wins and concerns
3. Recommended leadership actions`,
  };
}

export function nlQuestionPrompt(
  question: string,
  ctx: AnalyticsContext
): {
  system: string;
  user: string;
} {
  return {
    system: `${SYSTEM_BASE}
Answer the user's question using the provided data.
If the data doesn't contain enough information to answer, say so.
Be specific with numbers and agent names when relevant.`,
    user: `Question: ${question}

Available data:
${summarizeContext(ctx)}`,
  };
}

function summarizeContext(ctx: AnalyticsContext): string {
  const lines: string[] = [];
  if (ctx.today) {
    lines.push(`Today (${ctx.reportDate}): Calls=${ctx.today.total_calls_offered} offered, ${ctx.today.total_calls_answered} answered, ${ctx.today.total_abandoned} abandoned, AHT=${ctx.today.avg_aht}s, Shrinkage=${ctx.today.shrinkage_pct}%, Breaks=${ctx.today.total_breaks}`);
  }
  if (ctx.yesterday) {
    lines.push(`Yesterday: Calls=${ctx.yesterday.total_calls_offered} offered, AHT=${ctx.yesterday.avg_aht}s, Shrinkage=${ctx.yesterday.shrinkage_pct}%`);
  }
  if (ctx.lastWeek) {
    lines.push(`Last week same day: Calls=${ctx.lastWeek.total_calls_offered} offered, AHT=${ctx.lastWeek.avg_aht}s, Shrinkage=${ctx.lastWeek.shrinkage_pct}%`);
  }
  lines.push(`30-day avg: AHT=${ctx.recentAverages.avgAht}s, Shrinkage=${ctx.recentAverages.avgShrinkage}%, Abandonment=${ctx.recentAverages.avgAbandonment}%`);
  if (ctx.validationWarnings.length > 0) {
    lines.push(`Validation warnings: ${ctx.validationWarnings.length}`);
  }
  return lines.join("\n");
}

function summarizeAgentContext(ctx: AnalyticsContext): string {
  const lines: string[] = [];
  lines.push(`Report Date: ${ctx.reportDate}`);
  lines.push(`Total agents today: ${ctx.todayAgents.length}`);
  lines.push("");
  if (ctx.todayAgents.length > 0) {
    lines.push("Agent | LOB | AHT | Shrinkage% | Abandon% | Breaks");
    for (const a of ctx.todayAgents) {
      lines.push(
        `${a.agent_name} | ${a.lob ?? "-"} | ${a.aht ?? "-"} | ${a.shrinkage_pct ?? "-"} | ${a.abandonment_pct ?? "-"} | ${a.breaks_count}`
      );
    }
  }
  return lines.join("\n");
}
