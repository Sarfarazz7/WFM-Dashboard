import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export const AI_MODEL = "gpt-4o-mini";

export interface AiCompletionResult {
  content: string;
  tokensUsed: number;
}

export async function generateCompletion(
  systemPrompt: string,
  userPrompt: string,
  model: string = AI_MODEL
): Promise<AiCompletionResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await getClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw new Error("OpenAI returned an empty response");
  }

  return {
    content: choice.message.content,
    tokensUsed: response.usage?.total_tokens ?? 0,
  };
}

export async function generateCompletionWithRetry(
  systemPrompt: string,
  userPrompt: string,
  model: string = AI_MODEL,
  retries = 2
): Promise<AiCompletionResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await generateCompletion(systemPrompt, userPrompt, model);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}
