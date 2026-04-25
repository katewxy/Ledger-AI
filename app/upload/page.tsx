"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, Camera, CheckCircle, AlertCircle, FileText, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { t } from "@/lib/i18n";
import { parseCsv, parseExcel } from "@/lib/parseFile";
import { supabase } from "@/lib/supabase";
import { CATEGORY_ZH_MAP, type ParsedRow, type Currency } from "@/types";
import type { ClassifyResult } from "@/types";

type Tab = "file" | "receipt";

interface ReceiptData {
  merchant: string;
  amount: number;
  date: string;
  currency: string;
}

export default function UploadPage() {
  const { language, currency: globalCurrency } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("file");

  // ── File upload state ──────────────────────────────────────────
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileCurrency, setFileCurrency] = useState<Currency>(globalCurrency);
  const [classifying, setClassifying] = useState(false);
  const [classifyDone, setClassifyDone] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Receipt state ──────────────────────────────────────────────
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [receiptSaved, setReceiptSaved] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // ── File parsing ───────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setClassifyDone(false);
    setClassifyError(null);
    setDuplicateWarning(false);
    setParsed([]);

    try {
      let rows: ParsedRow[] = [];
      if (file.name.endsWith(".csv")) {
        const text = await file.text();
        rows = parseCsv(text);
      } else {
        const buf = await file.arrayBuffer();
        rows = await parseExcel(buf);
      }
      setParsed(rows);
    } catch (err) {
      setClassifyError(`Parse error: ${String(err)}`);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // ── Classification ─────────────────────────────────────────────

  const startClassification = async (force = false) => {
    if (parsed.length === 0) return;

    // Check for duplicate filename unless user has confirmed
    if (!force) {
      const { data: existing } = await supabase
        .from("uploads")
        .select("id")
        .eq("filename", fileName!)
        .eq("status", "done")
        .limit(1);
      if (existing && existing.length > 0) {
        setDuplicateWarning(true);
        return;
      }
    }

    setDuplicateWarning(false);
    setClassifying(true);
    setClassifyError(null);
    setProgress(0);

    try {
      const BATCH_SIZE = 50;
      const totalBatches = Math.ceil(parsed.length / BATCH_SIZE);
      let completedBatches = 0;

      // Save upload record first
      const { data: upload } = await supabase
        .from("uploads")
        .insert({ filename: fileName!, row_count: parsed.length, status: "processing" })
        .select()
        .single();
      const uploadId = upload?.id ?? null;

      // Build batch descriptors
      const batches = Array.from({ length: totalBatches }, (_, i) => ({
        index: i,
        rows: parsed.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE),
      }));

      // Process batches sequentially with a delay to avoid API rate limits
      for (let i = 0; i < batches.length; i++) {
        const { index, rows } = batches[i];
        if (i > 0) await new Promise((r) => setTimeout(r, 500));

        const descriptions = rows.map((r) => r.description);
        const res = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descriptions, currency: fileCurrency }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Batch ${index + 1} failed: ${text}`);
        }

        const { results } = (await res.json()) as { results: ClassifyResult[] };

        const txRows = rows.map((row, j) => {
          const result = results[j] ?? { category_en: "Other Expense", category_zh: "其他支出", confidence: 0.5 };
          return {
            upload_id: uploadId,
            date: row.date,
            description: row.description,
            amount: row.amount,
            currency: fileCurrency,
            category: result.category_en,
            category_zh: result.category_zh || CATEGORY_ZH_MAP[result.category_en] || result.category_en,
            confidence: result.confidence,
            source: "csv",
          };
        });
        await supabase.from("transactions").insert(txRows);

        completedBatches += 1;
        setProgress(Math.round((completedBatches / totalBatches) * 100));
      }

      // Mark upload done
      if (uploadId) {
        await supabase.from("uploads").update({ status: "done" }).eq("id", uploadId);
      }

      setProgress(100);
      setClassifyDone(true);
      setTimeout(() => router.push("/"), 1200);
    } catch (err) {
      setClassifyError(String(err));
    } finally {
      setClassifying(false);
    }
  };

  // ── Receipt handling ───────────────────────────────────────────

  const handleReceiptFile = async (file: File) => {
    setReceiptFile(file);
    setReceiptData(null);
    setReceiptSaved(false);
    setReceiptError(null);
    const url = URL.createObjectURL(file);
    setReceiptPreview(url);

    setExtracting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-receipt", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const { data } = await res.json() as { data: ReceiptData };
      setReceiptData(data);
    } catch (err) {
      setReceiptError(String(err));
    } finally {
      setExtracting(false);
    }
  };

  const saveReceipt = async () => {
    if (!receiptData) return;
    await supabase.from("transactions").insert({
      date: receiptData.date,
      description: receiptData.merchant,
      amount: receiptData.amount,
      currency: receiptData.currency,
      category: "Other Expense",
      category_zh: CATEGORY_ZH_MAP["Other Expense"],
      confidence: 0.9,
      source: "photo",
    });
    setReceiptSaved(true);
  };

  const preview = parsed.slice(0, 10);

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900">{t(language, "upload")}</h1>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-100">
        {(
          [
            { key: "file" as Tab, label: t(language, "uploadBankStatement") },
            { key: "receipt" as Tab, label: t(language, "receiptScan") },
          ] as { key: Tab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? "border-[#1D9E75] text-[#1D9E75]"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {key === "file" ? (
              <span className="flex items-center gap-1.5">
                <FileText size={14} />
                {label}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Camera size={14} />
                {label}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── FILE TAB ───────────────────────────────────────────── */}
      {tab === "file" && (
        <div className="space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              dragging
                ? "border-[#1D9E75] bg-[#1D9E75]/5"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <Upload
              size={28}
              className={dragging ? "text-[#1D9E75]" : "text-gray-300"}
            />
            <p className="mt-3 text-sm text-gray-500">{t(language, "dragDrop")}</p>
            <p className="text-xs text-gray-300 mt-1">{t(language, "supportedFormats")}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={onFileInput}
            />
          </div>

          {fileName && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FileText size={14} className="text-gray-400" />
              <span>{fileName}</span>
              {parsed.length > 0 && (
                <span className="text-gray-400">
                  — {parsed.length} {t(language, "rows")}
                </span>
              )}
            </div>
          )}

          {/* Currency selector */}
          {parsed.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{t(language, "selectCurrency")}:</span>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                {(["USD", "CNY"] as Currency[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setFileCurrency(c)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                      fileCurrency === c
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {c === "USD" ? "$ USD" : "¥ CNY"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          {preview.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-700">
                  {t(language, "preview")}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-50">
                      {[t(language, "date"), t(language, "description"), t(language, "amount")].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-4 py-2 text-left text-gray-400 font-medium uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-gray-500">{row.date}</td>
                        <td className="px-4 py-2 text-gray-700 max-w-xs truncate">
                          {row.description}
                        </td>
                        <td
                          className={`px-4 py-2 font-medium tabular-nums ${
                            row.amount >= 0 ? "text-emerald-600" : "text-red-500"
                          }`}
                        >
                          {row.amount >= 0 ? "+" : ""}
                          {row.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {classifying && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>{t(language, "classifying")}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1D9E75] rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Status messages */}
          {classifyDone && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle size={16} />
              {t(language, "classified")}
            </div>
          )}
          {classifyError && (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertCircle size={16} />
              {classifyError}
            </div>
          )}

          {/* Duplicate warning */}
          {duplicateWarning && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2 text-sm text-amber-800">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>
                  <strong>{fileName}</strong> has already been uploaded. Uploading again will create duplicate transactions.
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startClassification(true)}
                  className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors"
                >
                  Upload Anyway
                </button>
                <button
                  onClick={() => setDuplicateWarning(false)}
                  className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t(language, "cancel")}
                </button>
              </div>
            </div>
          )}

          {/* Classify button */}
          {parsed.length > 0 && !classifyDone && !duplicateWarning && (
            <button
              onClick={() => startClassification()}
              disabled={classifying}
              className="px-5 py-2.5 bg-[#1D9E75] text-white text-sm font-medium rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {classifying
                ? t(language, "classifying")
                : t(language, "startAiClassification")}
            </button>
          )}
        </div>
      )}

      {/* ── RECEIPT TAB ────────────────────────────────────────── */}
      {tab === "receipt" && (
        <div className="space-y-5">
          {!receiptFile ? (
            <div
              onClick={() => receiptInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-gray-300 bg-white transition-colors"
            >
              <Camera size={28} className="text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">
                {t(language, "receiptScan")}
              </p>
              <p className="text-xs text-gray-300 mt-1">JPG, PNG</p>
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleReceiptFile(f);
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {receiptPreview && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={receiptPreview}
                      alt="Receipt"
                      className="w-32 h-40 object-cover rounded-lg border border-gray-100"
                    />
                    <button
                      onClick={() => {
                        setReceiptFile(null);
                        setReceiptPreview(null);
                        setReceiptData(null);
                        setReceiptSaved(false);
                        setReceiptError(null);
                      }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 text-white rounded-full flex items-center justify-center"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )}
                <div className="flex-1">
                  {extracting && (
                    <p className="text-sm text-gray-400 animate-pulse">
                      {t(language, "extracting")}
                    </p>
                  )}
                  {receiptError && (
                    <div className="flex items-center gap-2 text-sm text-red-500">
                      <AlertCircle size={14} />
                      {receiptError}
                    </div>
                  )}
                  {receiptData && !extracting && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          {t(language, "merchant")}
                        </label>
                        <input
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
                          value={receiptData.merchant}
                          onChange={(e) =>
                            setReceiptData({ ...receiptData, merchant: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            {t(language, "total")}
                          </label>
                          <input
                            type="number"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
                            value={receiptData.amount}
                            onChange={(e) =>
                              setReceiptData({
                                ...receiptData,
                                amount: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            {t(language, "date")}
                          </label>
                          <input
                            type="date"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
                            value={receiptData.date}
                            onChange={(e) =>
                              setReceiptData({ ...receiptData, date: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!receiptSaved ? (
                          <button
                            onClick={saveReceipt}
                            className="px-4 py-2 bg-[#1D9E75] text-white text-sm font-medium rounded-lg hover:bg-[#178a64] transition-colors"
                          >
                            {t(language, "saveTransaction")}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-emerald-600">
                            <CheckCircle size={16} />
                            {t(language, "uploadSuccess")}
                          </div>
                        )}
                        <button
                          onClick={() => {
                            setReceiptFile(null);
                            setReceiptPreview(null);
                            setReceiptData(null);
                            setReceiptSaved(false);
                          }}
                          className="px-4 py-2 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          {t(language, "cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
