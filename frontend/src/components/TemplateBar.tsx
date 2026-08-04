"use client";

import { useEffect, useRef, useState } from "react";
import { createTemplate, deleteTemplate, listTemplates } from "@/lib/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { QuoteFormState, TemplateOut } from "@/lib/types";

interface TemplateBarProps {
  form: QuoteFormState;
  onLoad: (config: QuoteFormState) => void;
  compact?: boolean;
}

export default function TemplateBar({ form, onLoad, compact }: TemplateBarProps) {
  const { t } = useLocale();
  const [templates, setTemplates] = useState<TemplateOut[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refresh = () => listTemplates().then(setTemplates).catch(() => setError(t.templateBar.loadFailed));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSave = async () => {
    const name = window.prompt(t.templateBar.promptName);
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      await createTemplate(name, form);
      await refresh();
      setOpen(true);
    } catch {
      setError(t.templateBar.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t.templateBar.confirmDelete)) return;
    try {
      await deleteTemplate(id);
      await refresh();
    } catch {
      setError(t.templateBar.deleteFailed);
    }
  };

  // Full card mode (used in floating panel)
  if (!compact) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-50)] p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--surface-500)]">📁 {t.templateBar.title}</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-xs font-medium text-[var(--brand-600)] hover:text-[var(--brand-800)] disabled:opacity-50 transition-colors"
          >
            {saving ? "..." : `+ ${t.templateBar.saveAsTemplate}`}
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        {templates.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs"
              >
                <span className="truncate text-[var(--surface-600)]" title={tpl.name}>{tpl.name}</span>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => onLoad(tpl.config)} className="text-[var(--brand-600)] hover:underline">{t.templateBar.load}</button>
                  <button type="button" onClick={() => handleDelete(tpl.id)} className="text-red-400 hover:text-red-600">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Compact dropdown mode (for header)
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--surface-600)] hover:bg-[var(--surface-100)] transition-colors"
      >
        📁
        <span className="hidden sm:inline">{t.templateBar.title}</span>
        {templates.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--surface-200)] px-1 text-[10px] text-[var(--surface-500)]">
            {templates.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-[var(--border)] bg-white p-3 shadow-xl shadow-black/5 z-[1000]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-[var(--surface-700)]">{t.templateBar.title}</span>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-xs font-medium text-[var(--brand-600)] hover:text-[var(--brand-800)] disabled:opacity-50 transition-colors"
            >
              {saving ? "..." : "+ " + t.templateBar.saveAsTemplate}
            </button>
          </div>
          {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {templates.length === 0 && (
              <p className="text-xs text-[var(--surface-400)] text-center py-2">{t.templateBar.noTemplates}</p>
            )}
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between rounded-lg bg-[var(--surface-50)] px-2.5 py-1.5 text-sm hover:bg-[var(--surface-100)] transition-colors"
              >
                <span className="truncate text-[var(--surface-700)]" title={tpl.name}>{tpl.name}</span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => { onLoad(tpl.config); setOpen(false); }}
                    className="text-xs text-[var(--brand-600)] hover:text-[var(--brand-800)] px-1 transition-colors"
                  >
                    {t.templateBar.load}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(tpl.id)}
                    className="text-xs text-red-400 hover:text-red-600 px-1 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
