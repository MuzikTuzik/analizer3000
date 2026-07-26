"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Product, ProductAnalysis } from "@/lib/types";

type ProductsResponse = {
  products: Product[];
  saleColumnCount: number;
  fetchedAt: string;
  error?: string;
};

function formatQtyBreakdown(buckets: { quantity: number; orderCount: number }[]) {
  if (!buckets.length) return "—";
  return buckets.map((b) => `${b.quantity}×${b.orderCount}`).join(", ");
}

export function Analyzer() {
  const [products, setProducts] = useState<Product[]>([]);
  const [saleColumnCount, setSaleColumnCount] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isPending, startTransition] = useTransition();

  async function loadProducts() {
    setLoadingProducts(true);
    setError(null);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      const data = (await res.json()) as ProductsResponse;
      if (!res.ok) throw new Error(data.error || "Не удалось загрузить позиции");
      setProducts(data.products);
      setSaleColumnCount(data.saleColumnCount);
      setFetchedAt(data.fetchedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoadingProducts(false);
    }
  }

  async function loadAnalysis(q: string) {
    if (!q) {
      setAnalysis(null);
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/analyze?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось проанализировать");
      setAnalysis(data as ProductAnalysis);
    } catch (e) {
      setAnalysis(null);
      setError(e instanceof Error ? e.message : "Ошибка анализа");
    }
  }

  useEffect(() => {
    void loadProducts();
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
      void loadAnalysis(labelOrSku);
    });
  }

  async function refresh() {
    await fetch("/api/revalidate", { method: "POST" });
    await loadProducts();
    if (selected) {
      await loadAnalysis(selected);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Анализатор продаж крепежа
        </h1>
        <button
          type="button"
          onClick={() => void refresh()}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Обновить
        </button>
      </header>

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
          Позиций: {products.length}
          {saleColumnCount ? ` · заказов: ${saleColumnCount}` : ""}
          {fetchedAt
            ? ` · ${new Date(fetchedAt).toLocaleString("ru-RU")}`
            : ""}
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
                <Metric label="Заказов" value={String(analysis.orderCount)} />
                <Metric label="Клиентов" value={String(analysis.clientCount)} />
                <Metric label="Всего шт." value={String(analysis.totalQty)} />
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
                <h3 className="mb-3 text-base font-semibold">По сколько брали</h3>
                {analysis.byQuantity.length === 0 ? (
                  <p className="text-[var(--muted)]">Продаж нет</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {analysis.byQuantity.map((b) => (
                      <div
                        key={b.quantity}
                        className="min-w-[6.5rem] rounded-lg bg-[var(--accent-soft)] px-3 py-2.5"
                      >
                        <div className="font-mono text-xl font-medium tabular-nums">
                          {b.quantity}
                        </div>
                        <div className="text-sm text-[var(--muted)]">
                          {b.orderCount} {pluralOrders(b.orderCount)}
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
                            {formatQtyBreakdown(c.byQuantity)}
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
