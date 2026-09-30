import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { downloadFile } from "../lib/api";
import { useScope } from "../lib/hooks";
import { Icon } from "./Icons";

const FORMATS = [
  { id: "xlsx" as const, label: "Excel", className: "export-excel" },
  { id: "docx" as const, label: "Word", className: "export-word" },
  { id: "pdf" as const, label: "PDF", className: "export-pdf" },
];

const FILTER_KEYS = ["date_from", "date_to", "board", "region", "province", "payment_status", "segment", "channel", "source", "pic", "venue"];

export function ExportBar() {
  const { partner } = useScope();
  const [sp] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportAs = async (format: "xlsx" | "docx" | "pdf") => {
    setError(null);
    setBusy(format);
    const extra: Record<string, string> = {};
    for (const k of FILTER_KEYS) {
      const v = sp.get(k);
      if (v) extra[k] = v;
    }
    try {
      await downloadFile("/overview/export", { ...extra, partner, format });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xuất được báo cáo");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="export-bar" aria-label="Xuất báo cáo">
      <span className="export-label">Xuất báo cáo:</span>
      {FORMATS.map((f) => (
        <button
          key={f.id}
          type="button"
          className={`export-btn ${f.className}`}
          disabled={busy !== null}
          onClick={() => exportAs(f.id)}
        >
          <Icon.download />
          {busy === f.id ? "Đang xuất…" : f.label}
        </button>
      ))}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
