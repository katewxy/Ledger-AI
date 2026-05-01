
"use client";
import { useState } from "react";

const SECRET_KEY = "ledger-admin-2025";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sampleSize, setSampleSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9f9f9" }}>
        <div style={{ background: "white", padding: "2rem", borderRadius: "12px", border: "1px solid #eee", width: "320px" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "18px" }}>Admin Access</h2>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && password === SECRET_KEY && setAuthed(true)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "8px", marginBottom: "12px", fontSize: "14px" }}
          />
          <button
            onClick={() => password === SECRET_KEY ? setAuthed(true) : setError("Wrong password")}
            style={{ width: "100%", padding: "8px", background: "#000", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}
          >
            Enter
          </button>
          {error && <p style={{ color: "red", fontSize: "13px", marginTop: "8px" }}>{error}</p>}
        </div>
      </div>
    );
  }

  async function runTest() {
    if (!file) return;
    setLoading(true);
    setReport(null);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sampleSize", String(sampleSize));
      const res = await fetch("/api/test-accuracy", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReport(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ fontSize: "22px", fontWeight: "500", marginBottom: "0.5rem" }}>Ledger AI — Accuracy Test</h1>
      <p style={{ color: "#666", fontSize: "14px", marginBottom: "2rem" }}>Upload a labeled CSV to test classification accuracy.</p>

      {/* Upload */}
      <div style={{ background: "white", border: "1px solid #eee", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
        <label style={{ fontSize: "14px", fontWeight: "500", display: "block", marginBottom: "8px" }}>CSV File</label>
        <p style={{ fontSize: "12px", color: "#999", marginBottom: "12px" }}>Required columns: description, category</p>
        <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: "14px" }} />

        <div style={{ marginTop: "1rem" }}>
          <label style={{ fontSize: "14px", fontWeight: "500", display: "block", marginBottom: "8px" }}>
            LLM Sample Size: {sampleSize} rows
          </label>
          <input type="range" min={10} max={200} step={10} value={sampleSize}
            onChange={e => setSampleSize(Number(e.target.value))}
            style={{ width: "100%" }} />
          <p style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>More samples = more accurate but costs more API $</p>
        </div>

        <button
          onClick={runTest}
          disabled={!file || loading}
          style={{ marginTop: "1rem", padding: "8px 20px", background: file && !loading ? "#000" : "#ccc", color: "white", border: "none", borderRadius: "8px", cursor: file && !loading ? "pointer" : "not-allowed", fontSize: "14px" }}
        >
          {loading ? "Running test..." : "Run Accuracy Test"}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "2rem", color: "#666" }}>
          <p>Running classification test...</p>
          <p style={{ fontSize: "13px", marginTop: "8px" }}>This may take 1-2 minutes for LLM sampling.</p>
        </div>
      )}

      {/* Error */}
      {error && <div style={{ background: "#fff0f0", border: "1px solid #fcc", borderRadius: "8px", padding: "1rem", color: "#c00", fontSize: "14px" }}>{error}</div>}

      {/* Report */}
      {report && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            {[
              { label: "Total Rows", value: report.totalRows },
              { label: "Rule Coverage", value: `${report.ruleCoverage}%` },
              { label: "Rule Accuracy", value: `${report.ruleAccuracy}%` },
              { label: "LLM Accuracy", value: report.llmAccuracy ? `${report.llmAccuracy}%` : "N/A" },
              { label: "Overall Accuracy", value: report.overallAccuracy ? `${report.overallAccuracy}%` : "N/A" },
              { label: "Rule Errors", value: report.ruleErrors },
            ].map(s => (
              <div key={s.label} style={{ background: "white", border: "1px solid #eee", borderRadius: "10px", padding: "1rem" }}>
                <p style={{ fontSize: "12px", color: "#999", margin: "0 0 4px" }}>{s.label}</p>
                <p style={{ fontSize: "22px", fontWeight: "500", margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Rule errors */}
          {report.ruleWrongSamples?.length > 0 && (
            <div style={{ background: "white", border: "1px solid #eee", borderRadius: "12px", padding: "1.5rem" }}>
              <h3 style={{ fontSize: "15px", fontWeight: "500", marginBottom: "1rem" }}>Rule Layer Errors (sample)</h3>
              {report.ruleWrongSamples.map((r: any, i: number) => (
                <div key={i} style={{ borderTop: i > 0 ? "1px solid #f0f0f0" : "none", paddingTop: i > 0 ? "8px" : 0, marginTop: i > 0 ? "8px" : 0 }}>
                  <p style={{ fontSize: "13px", fontWeight: "500", margin: "0 0 2px" }}>{r.description}</p>
                  <p style={{ fontSize: "12px", color: "#999", margin: 0 }}>Expected: <span style={{ color: "#22c55e" }}>{r.expected}</span> · Got: <span style={{ color: "#ef4444" }}>{r.predicted}</span></p>
                </div>
              ))}
            </div>
          )}

          {/* LLM errors */}
          {report.llmWrongSamples?.length > 0 && (
            <div style={{ background: "white", border: "1px solid #eee", borderRadius: "12px", padding: "1.5rem" }}>
              <h3 style={{ fontSize: "15px", fontWeight: "500", marginBottom: "1rem" }}>LLM Layer Errors (sample)</h3>
              {report.llmWrongSamples.map((r: any, i: number) => (
                <div key={i} style={{ borderTop: i > 0 ? "1px solid #f0f0f0" : "none", paddingTop: i > 0 ? "8px" : 0, marginTop: i > 0 ? "8px" : 0 }}>
                  <p style={{ fontSize: "13px", fontWeight: "500", margin: "0 0 2px" }}>{r.description}</p>
                  <p style={{ fontSize: "12px", color: "#999", margin: 0 }}>Expected: <span style={{ color: "#22c55e" }}>{r.expected}</span> · Got: <span style={{ color: "#ef4444" }}>{r.predicted}</span></p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}