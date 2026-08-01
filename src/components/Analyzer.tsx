"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Product, ProductAnalysis } from "@/lib/types";
import { APP_VERSION } from "@/lib/version";
import { yearsQuery } from "@/lib/years";

type ProductsResponse = {
  products: Product[];
  saleColumnCount: number;
  years?: string[];
  error?: string;
};

function formatOrderQuantities(orders: { quantity: number }[]) {
  if (!orders.length) return "—";
  return orders
    .map((o) => o.quantity)
    .sort((a, b) => a - b)
    .join(", ");
}

export function Analyzer() {
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saleColumnCount, setSaleColumnCount] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [exporting, setExporting] = useState<"25" | "50" | null>(null);
  const [topLimit, setTopLimit] = useState("150");
  const [isPending, startTransition] = useTransition();

  const yearsParam = useMemo(() => yearsQuery(selectedYears), [selectedYears]);

  const topLimitNum = useMemo(() => {
    const n = Number(topLimit.trim());
    if (!Number.isFinite(n)) return 150;
    return Math.min(5000, Math.max(1, Math.floor(n)));
  }, [topLimit]);

  async function loadYears() {
    const res = await fetch("/api/years", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Не удалось загрузить годы");
    const years = (data.years as string[]) ?? [];
    setAvailableYears(years);
    setSelectedYears((prev) => {
      if (!prev.length) return years; // default: all years
      const keep = prev.filter((y) => years.includes(y));
      return keep.length ? keep : years;
    });
    return years;
  }

  async function loadProducts(years: string[]) {
    setLoadingProducts(true);
    setError(null);
    try {
      const qs = yearsQuery(years);
      const res = await fetch(`/api/products${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ProductsResponse;
      if (!res.ok) throw new Error(data.error || "Не удалось загрузить позиции");
      setProducts(data.products);
      setSaleColumnCount(data.saleColumnCount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoadingProducts(false);
    }
  }

  async function loadAnalysis(q: string, years: string[]) {
    if (!q) {
      setAnalysis(null);
      return;
    }
    if (!years.length) {
      setAnalysis(null);
      setError("Выберите хотя бы один год");
      return;
    }
    setError(null);
    try {
      const qs = yearsQuery(years);
      const res = await fetch(
        `/api/analyze?q=${encodeURIComponent(q)}${qs ? `&${qs}` : ""}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось проанализировать");
      setAnalysis(data as ProductAnalysis);
    } catch (e) {
      setAnalysis(null);
      setError(e instanceof Error ? e.message : "Ошибка анализа");
    }
  }

  useEffect(() => {
    void loadYears().catch((e) => {
      setError(e instanceof Error ? e.message : "Ошибка загрузки годов");
      setLoadingProducts(false);
    });
  }, []);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          p.label.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [products, query]);

  function selectProduct(labelOrSku: string) {
    setSelected(labelOrSku);
    setQuery(labelOrSku);
    startTransition(() => {
      void loadAnalysis(labelOrSku, selectedYears);
    });
  }

  function toggleYear(year: string) {
    setSelectedYears((prev) => {
      if (prev.includes(year)) {
        if (prev.length === 1) return prev; // keep at least one year
        return prev.filter((y) => y !== year);
      }
      return [...prev, year].sort((a, b) => b.localeCompare(a));
    });
  }

  const allYearsSelected =
    availableYears.length > 0 &&
    availableYears.every((y) => selectedYears.includes(y));

  function toggleAllYears() {
    if (allYearsSelected) {
      // keep newest year if unchecking "all"
      setSelectedYears(availableYears.slice(0, 1));
    } else {
      setSelectedYears(availableYears);
    }
  }

  useEffect(() => {
    if (!availableYears.length || !selectedYears.length) return;
    void loadProducts(selectedYears);
    if (selected) {
      startTransition(() => {
        void loadAnalysis(selected, selectedYears);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when year selection changes
  }, [selectedYears.join(",")]);

  async function refresh() {
    await fetch("/api/revalidate", { method: "POST" });
    const years = await loadYears();
    const active = selectedYears.length
      ? selectedYears.filter((y) => years.includes(y))
      : years;
    setSelectedYears(active.length ? active : years);
    await loadProducts(active.length ? active : years);
    if (selected) {
      await loadAnalysis(selected, active.length ? active : years);
    }
  }

  async function exportTopExcel(kind: "25" | "50") {
    setExporting(kind);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (yearsParam.startsWith("years=")) {
        params.set("years", selectedYears.join(","));
      }
      params.set("limit", String(topLimitNum));
      const res = await fetch(`/api/export/top${kind}?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || "Не удалось создать Excel");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const yearLabel = selectedYears.length
        ? selectedYears.join("-")
        : "all";
      a.download = `top${topLimitNum}-po${kind}-${yearLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка выгрузки Excel");
    } finally {
      setExporting(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Анализатор продаж крепежа
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
            Топ
            <input
              type="number"
              min={1}
              max={5000}
              value={topLimit}
              onChange={(e) => setTopLimit(e.target.value)}
              className="w-20 rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 font-mono text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void exportTopExcel("25")}
            disabled={exporting !== null || loadingProducts || !selectedYears.length}
            className="shrink-0 rounded-lg border border-[var(--accent)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            {exporting === "25" ? "Создаём Excel…" : `Excel: топ ${topLimitNum} по 25`}
          </button>
          <button
            type="button"
            onClick={() => void exportTopExcel("50")}
            disabled={exporting !== null || loadingProducts || !selectedYears.length}
            className="shrink-0 rounded-lg border border-[var(--accent)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            {exporting === "50" ? "Создаём Excel…" : `Excel: топ ${topLimitNum} по 50`}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Обновить
          </button>
        </div>
      </header>

      <section className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="mb-2 text-sm text-[var(--muted)]">Года</div>
        <div className="flex flex-wrap gap-3">
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
              allYearsSelected
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--line)] bg-white"
            }`}
          >
            <input
              type="checkbox"
              checked={allYearsSelected}
              onChange={toggleAllYears}
              disabled={!availableYears.length}
              className="accent-[var(--accent)]"
            />
            Все года
          </label>
          {availableYears.map((year) => {
            const checked = selectedYears.includes(year);
            return (
              <label
                key={year}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                  checked
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--line)] bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleYear(year)}
                  className="accent-[var(--accent)]"
                />
                {year}
              </label>
            );
          })}
          {!availableYears.length && (
            <span className="text-sm text-[var(--muted)]">Загрузка годов…</span>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
        <label className="mb-2 block text-sm text-[var(--muted)]" htmlFor="product">
          Позиция
        </label>
        <input
          id="product"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              selectProduct(query.trim());
            }
          }}
          placeholder="10004-1 или 10026"
          className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
          autoComplete="off"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {loadingProducts && (
            <span className="text-sm text-[var(--muted)]">Загрузка…</span>
          )}
          {!loadingProducts &&
            suggestions.map((p) => (
              <button
                key={`${p.sku}-${p.label}`}
                type="button"
                onClick={() => selectProduct(p.sku)}
                className={`rounded-lg border px-2.5 py-1 text-sm transition ${
                  selected === p.sku || selected === p.label
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
                }`}
                title={p.label}
              >
                {p.sku}
              </button>
            ))}
        </div>

        <p className="mt-3 font-mono text-xs text-[var(--muted)]">
          Года: {selectedYears.join(", ") || "—"}
          {" · "}
          Позиций: {products.length}
          {analysis ? ` · Заказов: ${saleColumnCount}` : ""}
          {" · "}
          {APP_VERSION}
        </p>
      </section>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-[var(--warn)]">
          {error}
        </div>
      )}

      {(isPending || analysis) && (
        <section className="mt-6 flex flex-col gap-5">
          {isPending && !analysis && (
            <p className="text-[var(--muted)]">Считаем…</p>
          )}

          {analysis && (
            <>
              <div>
                <h2 className="text-xl font-semibold">
                  {analysis.product.label}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {analysis.product.sku}
                  {analysis.product.stock != null
                    ? ` · остаток ${analysis.product.stock}`
                    : ""}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                  <div className="border-r border-[var(--line)] px-4 py-3">
                    <div className="text-sm text-[var(--muted)]">Заказов</div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight">
                      {analysis.orderCount}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-sm text-[var(--muted)]">Клиентов</div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight">
                      {analysis.clientCount}
                    </div>
                  </div>
                </div>
                <Metric label="Продано" value={String(analysis.totalQty)} />
                <Metric
                  label="Остаток"
                  value={
                    analysis.product.stock != null
                      ? String(analysis.product.stock)
                      : "—"
                  }
                />
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
                <h3 className="mb-3 text-base font-semibold">
                  По сколько брали (25 / 50)
                </h3>
                {analysis.byQuantity.length === 0 ? (
                  <p className="text-[var(--muted)]">Продаж нет</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {analysis.byQuantity.map((b) => (
                      <div
                        key={b.quantity}
                        className="min-w-[7.5rem] rounded-lg bg-[var(--accent-soft)] px-3 py-2.5"
                      >
                        <div className="font-mono text-xl font-medium tabular-nums">
                          {b.quantity}
                        </div>
                        <div className="text-sm text-[var(--muted)]">
                          {b.orderCount} {pluralOrders(b.orderCount)}
                        </div>
                        <div className="mt-0.5 font-mono text-xs text-[var(--muted)]">
                          {b.packCount} уп. · {b.packCount * b.quantity} шт.
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                <div className="border-b border-[var(--line)] px-4 py-3">
                  <h3 className="text-base font-semibold">Покупатели</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[var(--bg)] text-[var(--muted)]">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Клиент</th>
                        <th className="w-24 px-4 py-2.5 font-medium">Заказов</th>
                        <th className="w-28 px-4 py-2.5 font-medium">Итого шт.</th>
                        <th className="px-4 py-2.5 font-medium">По количествам</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.clients.map((c) => (
                        <tr
                          key={c.client}
                          className="border-t border-[var(--line)]"
                        >
                          <td className="px-4 py-2.5">{c.client}</td>
                          <td className="px-4 py-2.5 font-mono tabular-nums">
                            {c.orderCount}
                          </td>
                          <td className="px-4 py-2.5 font-mono tabular-nums">
                            {c.totalQty}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[var(--muted)]">
                            {formatOrderQuantities(c.orders)}
                          </td>
                        </tr>
                      ))}
                      {analysis.clients.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-5 text-[var(--muted)]">
                            Нет покупателей по этой позиции
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <div className="text-sm text-[var(--muted)]">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </div>
    </div>
  );
}

function pluralOrders(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "раз";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "раза";
  return "раз";
}
