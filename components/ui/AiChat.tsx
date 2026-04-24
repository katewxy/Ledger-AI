"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { Send, Bot, User, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { t } from "@/lib/i18n";

interface Message {
  role: "user" | "assistant";
  content: string;
  sql?: string;
  error?: boolean;
}

const EXAMPLE_QUESTIONS: Record<"en" | "zh", string[]> = {
  en: [
    "Which month had the highest expenses?",
    "What was my biggest single expense?",
    "How much did I spend on payroll?",
    "Show months where expenses exceeded income",
  ],
  zh: [
    "哪个月的支出最高？",
    "单笔金额最大的是哪笔交易？",
    "我在人工成本上花了多少？",
    "哪些月份支出超过了收入？",
  ],
};

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

function SqlBlock({ sql, label }: { sql: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        {label}
      </button>
      {open && (
        <pre className="mt-1.5 text-xs bg-gray-900 text-green-400 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {sql}
        </pre>
      )}
    </div>
  );
}

export default function AiChat() {
  const { language } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSubmit(e: FormEvent | null, question?: string) {
    e?.preventDefault();
    const q = (question ?? input).trim();
    if (!q || loading) return;

    setInput("");
    const userMsg: Message = { role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // Build history from current messages (natural language only, no sql metadata)
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history, language }),
      });

      const data = await res.json() as { answer?: string; sql?: string; error?: string; detail?: string };

      if (!res.ok || data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: t(language, "chatError"), error: true },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.answer!, sql: data.sql },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t(language, "chatError"), error: true },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  const examples = EXAMPLE_QUESTIONS[language];

  return (
    <div className="bg-white border border-gray-100 rounded-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Bot size={16} className="text-[#1D9E75]" />
        <h2 className="text-sm font-medium text-gray-700">{t(language, "chatTitle")}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-[260px] max-h-[420px]">
        {messages.length === 0 && !loading && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{t(language, "chatExamples")}</p>
            <div className="flex flex-wrap gap-2">
              {examples.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSubmit(null, q)}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-full text-gray-600 hover:border-[#1D9E75] hover:text-[#1D9E75] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-[#1D9E75]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={12} className="text-[#1D9E75]" />
              </div>
            )}

            <div className={`max-w-[80%] ${msg.role === "user" ? "order-first" : ""}`}>
              <div
                className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#1D9E75] text-white rounded-tr-sm"
                    : msg.error
                    ? "bg-red-50 text-red-600 border border-red-100 rounded-tl-sm"
                    : "bg-gray-100 text-gray-800 rounded-tl-sm"
                }`}
              >
                {msg.error && <AlertCircle size={13} className="inline mr-1.5 mb-0.5" />}
                {msg.content}
              </div>
              {msg.sql && (
                <SqlBlock sql={msg.sql} label={t(language, "chatSqlLabel")} />
              )}
            </div>

            {msg.role === "user" && (
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User size={12} className="text-gray-400" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-6 h-6 rounded-full bg-[#1D9E75]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot size={12} className="text-[#1D9E75]" />
            </div>
            <div className="px-3.5 py-2.5 bg-gray-100 rounded-2xl rounded-tl-sm">
              <ThinkingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t(language, "chatPlaceholder")}
            disabled={loading}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1D9E75] disabled:bg-gray-50 disabled:text-gray-400 placeholder:text-gray-300"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-3 py-2 bg-[#1D9E75] text-white rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm font-medium"
          >
            <Send size={13} />
            {t(language, "chatSend")}
          </button>
        </form>
      </div>
    </div>
  );
}
