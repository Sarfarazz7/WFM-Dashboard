"use client";

import { useState, useRef, useEffect } from "react";

async function parseApiResponse(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `Server returned a non-JSON response (status ${res.status}): ${text.slice(0, 200)}`
    );
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? `Request failed with status ${res.status}`);
  }
  return json;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  tokensUsed?: number;
}

interface Props {
  dateFrom?: string;
  dateTo?: string;
  lob?: string;
}

export default function NaturalLanguageQuery({ dateFrom, dateTo, lob }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, dateFrom, dateTo, lob }),
      });

      const json = await parseApiResponse(res);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.answer, tokensUsed: json.tokensUsed },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Failed to get answer"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "Who had highest break time?",
    "Which team had lowest productivity?",
    "Which agents were late?",
    "Why did AHT increase?",
    "What is today's shrinkage?",
    "Summarize today's performance",
  ];

  return (
    <section className="border border-ink-600/60 bg-ink-800 p-4">
      <h2 className="text-sm font-medium text-mist-200 mb-3">Ask a Question</h2>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-ink-600 text-mist-400 hover:border-mist-400 hover:text-mist-200 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div role="log" aria-label="Chat messages" aria-live="polite" className="max-h-80 overflow-y-auto space-y-3 mb-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600/20 text-blue-200 border border-blue-500/30"
                    : "bg-ink-700 text-mist-300 border border-ink-600"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {msg.tokensUsed && (
                  <div className="text-xs text-mist-400 mt-1">{msg.tokensUsed} tokens</div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-ink-700 border border-ink-600 rounded-lg px-3 py-2 text-sm text-mist-400">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="nlq-input" className="sr-only">Ask a question about your data</label>
        <input
          id="nlq-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your data..."
          disabled={loading}
          className="flex-1 input text-sm"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="btn-primary text-sm px-4"
        >
          {loading ? "..." : "Ask"}
        </button>
      </form>
    </section>
  );
}
