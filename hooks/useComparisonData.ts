"use client";

import { useState, useEffect, useMemo } from "react";

export interface ComparisonData<T> {
  current: T | null;
  yesterday: T | null;
  lastWeek: T | null;
  loading: boolean;
  error: string | null;
}

export function useComparisonData<T>(
  apiUrl: string,
  dateFrom: string,
  dateTo: string,
  params?: Record<string, string>
): ComparisonData<T> {
  const [current, setCurrent] = useState<T | null>(null);
  const [yesterday, setYesterday] = useState<T | null>(null);
  const [lastWeek, setLastWeek] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dates = useMemo(() => {
    if (!dateFrom) return null;

    const from = new Date(dateFrom);
    const to = dateTo ? new Date(dateTo) : from;

    const yFrom = new Date(from);
    yFrom.setDate(yFrom.getDate() - 1);
    const yTo = new Date(to);
    yTo.setDate(yTo.getDate() - 1);

    const lwFrom = new Date(from);
    lwFrom.setDate(lwFrom.getDate() - 7);
    const lwTo = new Date(to);
    lwTo.setDate(lwTo.getDate() - 7);

    const fmt = (d: Date) => d.toISOString().split("T")[0];

    return {
      currentFrom: fmt(from),
      currentTo: fmt(to),
      yesterdayFrom: fmt(yFrom),
      yesterdayTo: fmt(yTo),
      lastWeekFrom: fmt(lwFrom),
      lastWeekTo: fmt(lwTo),
    };
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!dates) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchAll() {
      const baseParams = new URLSearchParams(params);
      if (dates) {
        baseParams.set("dateFrom", dates.currentFrom);
        baseParams.set("dateTo", dates.currentTo);
      }

      const yParams = new URLSearchParams(params);
      if (dates) {
        yParams.set("dateFrom", dates.yesterdayFrom);
        yParams.set("dateTo", dates.yesterdayTo);
      }

      const lwParams = new URLSearchParams(params);
      if (dates) {
        lwParams.set("dateFrom", dates.lastWeekFrom);
        lwParams.set("dateTo", dates.lastWeekTo);
      }

      try {
        const [curRes, yRes, lwRes] = await Promise.all([
          fetch(`${apiUrl}?${baseParams}`).then((r) => r.ok ? r.json() : null),
          fetch(`${apiUrl}?${yParams}`).then((r) => r.ok ? r.json() : null),
          fetch(`${apiUrl}?${lwParams}`).then((r) => r.ok ? r.json() : null),
        ]);

        if (!cancelled) {
          setCurrent(curRes);
          setYesterday(yRes);
          setLastWeek(lwRes);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [apiUrl, dates, params]);

  return { current, yesterday, lastWeek, loading, error };
}
