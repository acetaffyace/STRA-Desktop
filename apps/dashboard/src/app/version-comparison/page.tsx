'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { PageTransition } from '@/components/PageTransition';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchVersionEvents, searchGames, syncNewsVersionEvents, type NewsVersionSyncResponse, type VersionEventResponse } from '@/lib/api';
import { formatTaxonomyLabelZh } from '@/lib/taxonomyLabels';
import type { SearchResult } from '@/types';
import {
  createVersionComparisonPlan,
  fetchVersionComparisonRun,
  startVersionComparison,
  type VersionComparisonAnalysisMode,
  type VersionComparisonMetrics,
  type VersionComparisonPlan,
  type VersionComparisonRequest,
  type VersionComparisonRun,
  type VersionComparisonTopic,
} from '@/lib/versionComparisonApi';

const COHORT_LABELS = {
  A_PRE: '版本 A · 更新前',
  A_POST: '版本 A · 更新后',
  B_PRE: '版本 B · 更新前',
  B_POST: '版本 B · 更新后',
} as const;

const TOPIC_COHORTS: Array<{ key: keyof VersionComparisonTopic['rates']; label: string }> = [
  { key: 'A_PRE', label: 'A 更新前' },
  { key: 'A_POST', label: 'A 更新后' },
  { key: 'B_PRE', label: 'B 更新前' },
  { key: 'B_POST', label: 'B 更新后' },
];

function pct(value: number | null | undefined): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function pp(value: number | null | undefined): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} 个百分点`;
}

function dateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function setSavedRunUrl(runId: string | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (runId) url.searchParams.set('run', runId);
  else url.searchParams.delete('run');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function levelLabel(value?: string): string {
  if (value === 'high') return '高';
  if (value === 'moderate') return '中';
  if (value === 'low') return '低';
  if (value === 'unknown') return '未知';
  return value || '未知';
}

function versionEventTypeLabel(value?: string): string {
  const labels: Record<string, string> = {
    patch: '补丁更新',
    news: '新闻公告',
    dlc: '追加内容',
    major_update: '大型更新',
    content_update: '内容更新',
  };
  return labels[value || ''] || '其他事件';
}

function warningLabel(value: string): string {
  if (value === 'event_a_not_manually_verified') return '版本 A 的事件时间尚未经过人工核实。';
  if (value === 'event_b_not_manually_verified') return '版本 B 的事件时间尚未经过人工核实。';
  if (value === 'semantic_sample_insufficient_common_support') return '共同支持样本不足，暂不展示语义对比。';
  if (value.startsWith('semantic_status:')) return '语义分类未能完整完成，请结合样本覆盖情况解读结果。';
  if (value.startsWith('primary_acquisition_incomplete_or_capped:')) return '主要窗口采集不完整或已达到评论上限；当前指标仅描述已采集的评论样本。';
  if (value.startsWith('sensitivity_windows_partial:')) {
    const windows = value.slice('sensitivity_windows_partial:'.length).split(',').filter(Boolean).join('、');
    return `部分敏感性窗口（${windows} 天）的评论采集不完整。`;
  }
  return value;
}

function MetricTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
      {note && <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>}
    </div>
  );
}

function DeltaTile({ label, value, emphasis = false }: { label: string; value: number | null | undefined; emphasis?: boolean }) {
  const positive = (value ?? 0) > 0;
  const negative = (value ?? 0) < 0;
  return (
    <div className={`rounded-xl border p-4 ${emphasis ? 'border-cyan-400/30 bg-cyan-400/[0.06]' : 'border-white/10 bg-black/20'}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${positive ? 'text-emerald-300' : negative ? 'text-rose-300' : 'text-white'}`}>{pp(value)}</p>
    </div>
  );
}

function TopicChangeMetric({ label, value, emphasis = false }: { label: string; value: number | null | undefined; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${emphasis ? 'border-cyan-400/25 bg-cyan-400/[0.06]' : 'border-white/[0.07] bg-black/20'}`}>
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${value == null ? 'text-slate-500' : emphasis ? 'text-cyan-200' : 'text-slate-200'}`}>{pp(value)}</span>
    </div>
  );
}

function TopicTable({ title, rows, sampleCounts }: {
  title: string;
  rows: VersionComparisonTopic[];
  sampleCounts?: Partial<Record<keyof VersionComparisonTopic['rates'], number>>;
}) {
  return (
    <Card variant="glass" className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">语义对比</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-400">主题提及率以支持评论数除以各窗口共同语义样本数计算</p>
        </div>
        <Badge variant="default">{rows.length} 个主题</Badge>
      </div>
      {rows.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-center text-sm text-slate-500">
          共同语义样本中暂时没有可对比的主题。
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.slice(0, 12).map((row) => {
            const rates = TOPIC_COHORTS.map(({ key }) => row.rates[key]).filter((rate): rate is number => rate != null);
            const highestRate = rates.length ? Math.max(...rates) : null;
            const topicLabel = formatTaxonomyLabelZh(row.topic_id) || row.display_name;
            const totalSupport = TOPIC_COHORTS.reduce((total, { key }) => total + (row.support[key] ?? 0), 0);

            return (
              <article key={row.topic_id} className="rounded-xl border border-white/10 bg-slate-900/30 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-white sm:text-base" title={topicLabel}>{topicLabel}</h4>
                    <p className="mt-1 text-xs text-slate-500">四个窗口共 {totalSupport.toLocaleString()} 条主题支持评论</p>
                  </div>
                  <span className="shrink-0 rounded-md border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-slate-400">更新前后对照</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TOPIC_COHORTS.map(({ key, label }) => {
                    const rate = row.rates[key];
                    const support = row.support[key] ?? 0;
                    const denominator = sampleCounts?.[key];
                    const denominatorLabel = denominator == null || denominator === 0 ? '—' : denominator.toLocaleString();
                    const isHighest = rate != null && highestRate != null && rate === highestRate && highestRate > 0;
                    return (
                      <div key={key} className={`rounded-lg border px-3 py-2.5 ${isHighest ? 'border-blue-400/50 bg-blue-500/10' : 'border-white/[0.07] bg-black/20'}`}>
                        <p className="truncate text-[11px] text-slate-500">{label}</p>
                        <p className={`mt-1 text-lg font-semibold tabular-nums ${isHighest ? 'text-sky-300' : 'text-slate-200'}`}>{pct(rate)}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{support.toLocaleString()} / {denominatorLabel} 条评论</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <TopicChangeMetric label="版本 A · 更新前后" value={row.a_change_pp} />
                  <TopicChangeMetric label="版本 B · 更新前后" value={row.b_change_pp} />
                  <TopicChangeMetric label="相对变化 · ΔΔ" value={row.difference_in_differences_pp} emphasis />
                </div>
              </article>
            );
          })}
          {rows.length > 12 && <p className="pt-1 text-center text-xs text-slate-500">按相对变化幅度排序，当前显示前 12 个主题。</p>}
        </div>
      )}
    </Card>
  );
}

export default function VersionComparisonPage() {
  const [gameQuery, setGameQuery] = useState('');
  const [games, setGames] = useState<SearchResult[]>([]);
  const [appId, setAppId] = useState<number | null>(null);
  const [gameName, setGameName] = useState('');
  const [events, setEvents] = useState<VersionEventResponse[]>([]);
  const [eventA, setEventA] = useState('');
  const [eventB, setEventB] = useState('');
  const [windowDays, setWindowDays] = useState<3 | 7 | 14>(7);
  const [mode, setMode] = useState<VersionComparisonAnalysisMode>('raw_only');
  const [maxPerCohort, setMaxPerCohort] = useState<500 | 1000 | 2000 | 5000 | 10000>(2000);
  const [semanticBudget, setSemanticBudget] = useState(4000);
  const [plan, setPlan] = useState<VersionComparisonPlan | null>(null);
  const [run, setRun] = useState<VersionComparisonRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoringRun, setRestoringRun] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<NewsVersionSyncResponse | null>(null);
  const [eventRevision, setEventRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedRunId = new URLSearchParams(window.location.search).get('run');
    if (!savedRunId) return;

    let cancelled = false;
    setRestoringRun(true);
    setError(null);
    fetchVersionComparisonRun(savedRunId)
      .then((savedRun) => {
        if (cancelled) return;
        setRun(savedRun);
        setAppId(savedRun.target_app_id);
        const analysis = (savedRun.config as { analysis?: {
          analysis_mode?: VersionComparisonAnalysisMode;
          window_days?: 3 | 7 | 14;
          max_reviews_per_cohort?: 500 | 1000 | 2000 | 5000 | 10000;
          semantic_budget?: number;
        } }).analysis;
        if (analysis?.analysis_mode) setMode(analysis.analysis_mode);
        if (analysis?.window_days) setWindowDays(analysis.window_days);
        if (analysis?.max_reviews_per_cohort) setMaxPerCohort(analysis.max_reviews_per_cohort);
        if (analysis?.semantic_budget) setSemanticBudget(analysis.semantic_budget);
        if (savedRun.status === 'failed') setError(savedRun.error || '这次版本对比运行失败。');
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? `无法恢复这份版本对比：${err.message}` : '无法恢复这份版本对比。');
      })
      .finally(() => { if (!cancelled) setRestoringRun(false); });

    return () => { cancelled = true; };
  }, []);

  const request = useMemo<VersionComparisonRequest | null>(() => {
    if (!appId || !eventA || !eventB || eventA === eventB) return null;
    return {
      app_id: appId,
      event_a_id: eventA,
      event_b_id: eventB,
      window_days: windowDays,
      languages: ['all'],
      max_reviews_per_cohort: maxPerCohort,
      analysis_mode: mode,
      semantic_budget: mode === 'semantic' ? semanticBudget : 0,
    };
  }, [appId, eventA, eventB, windowDays, maxPerCohort, mode, semanticBudget]);

  const metrics = run?.metrics?.schema_version === 'version-comparison-v3' ? run.metrics as VersionComparisonMetrics : null;
  const acquisitionProgress = run?.status === 'running' && run.metrics?.schema_version === 'version-comparison-v3-progress'
    ? (run.metrics as { progress?: { stage?: string; cohort?: keyof typeof COHORT_LABELS; completed?: number; total?: number; reviews_collected?: number; source?: string; completed_cohorts?: Record<string, { reviews_collected?: number; source?: string }> } }).progress
    : null;
  const completedAcquisition = Object.values(acquisitionProgress?.completed_cohorts ?? {});
  const acquiredReviewCount = completedAcquisition.reduce((sum, item) => sum + (item.reviews_collected ?? 0), 0);
  const steamCohortCount = completedAcquisition.filter((item) => item.source !== 'cache').length;
  const cacheCohortCount = completedAcquisition.filter((item) => item.source === 'cache').length;

  useEffect(() => {
    if (!request) { setPlan(null); return; }
    let cancelled = false;
    createVersionComparisonPlan(request)
      .then((value) => { if (!cancelled) setPlan(value); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : '无法生成版本对比方案。'); });
    return () => { cancelled = true; };
  }, [request, eventRevision]);

  useEffect(() => {
    if (!run || run.status !== 'running') return;
    const timer = window.setInterval(async () => {
      try {
        const next = await fetchVersionComparisonRun(run.run_id);
        setRun(next);
        if (next.status === 'failed') setError(next.error || '版本对比执行失败。');
      } catch (err) {
        setError(err instanceof Error ? err.message : '无法读取分析进度。');
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [run]);

  const findGame = async () => {
    const query = gameQuery.trim();
    if (!query) return;
    setLoading(true); setError(null);
    try { setGames(await searchGames(query)); }
    catch (err) { setError(err instanceof Error ? err.message : '无法搜索游戏。'); }
    finally { setLoading(false); }
  };

  const selectGame = async (game: SearchResult) => {
    setSavedRunUrl(null);
    setAppId(game.appid); setGameName(game.name); setGameQuery(game.name); setGames([]); setPlan(null); setRun(null); setSyncStatus(null); setError(null);
    setLoading(true);
    try {
      let nextEvents = await fetchVersionEvents(game.appid);
      if (nextEvents.length < 2) {
        setSyncing(true);
        const result = await syncNewsVersionEvents(game.appid, { news_count: 60 });
        setSyncStatus(result);
        nextEvents = await fetchVersionEvents(game.appid);
      }
      nextEvents = [...nextEvents].sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
      setEvents(nextEvents);
      if (nextEvents.length >= 2) {
        setEventA(nextEvents[nextEvents.length - 2].event_id);
        setEventB(nextEvents[nextEvents.length - 1].event_id);
      }
    } catch (err) { setError(err instanceof Error ? err.message : '无法读取版本事件。'); }
    finally { setLoading(false); setSyncing(false); }
  };

  const refreshEvents = async () => {
    if (!appId) return;
    setSyncing(true); setSyncStatus(null); setError(null);
    try {
      const result = await syncNewsVersionEvents(appId, { news_count: 80 });
      setSyncStatus(result);
      const next = [...await fetchVersionEvents(appId)].sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
      setEvents(next);
      setEventRevision((value) => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : '同步版本事件失败。'); }
    finally { setSyncing(false); }
  };

  const start = async () => {
    if (!request) return;
    setLoading(true); setError(null);
    try {
      const result = await startVersionComparison(request);
      setPlan(result.plan);
      setRun(result.run);
      setSavedRunUrl(result.run.run_id);
    } catch (err) { setError(err instanceof Error ? err.message : '无法启动版本对比。'); }
    finally { setLoading(false); }
  };

  const raw = metrics?.raw;
  const cohortEntries = raw ? Object.entries(raw.cohorts) as Array<[keyof typeof COHORT_LABELS, typeof raw.cohorts.A_PRE]> : [];
  const phaseText: Record<string, string> = {
    planning: '正在生成四窗口方案',
    acquiring_a_pre: '正在准备版本 A 更新前评论',
    acquiring_a_post: '正在准备版本 A 更新后评论',
    acquiring_b_pre: '正在准备版本 B 更新前评论',
    acquiring_b_post: '正在准备版本 B 更新后评论',
    building_semantic_sample: '正在构造可比语义样本',
    classifying_semantic_sample: '正在进行统一口径语义分类',
    finalizing: '正在生成对比报告',
  };

  return (
    <AppLayout>
      <PageTransition>
        <div className="min-h-screen bg-[rgb(5,5,15)] px-4 py-8 text-slate-100 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-7xl space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-400/70">版本对比研究</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">版本对比</h1>
              <p className="mt-2 text-sm text-slate-400">比较两个版本更新前后的玩家反馈。</p>
            </div>

            <Card variant="gradient">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end">
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-500">游戏</label>
                  <div className="mt-2 flex gap-2">
                    <input value={gameQuery} onChange={(e) => setGameQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void findGame(); }} placeholder="输入游戏名" className="min-h-11 flex-1 rounded-md border border-cyan-400/20 bg-black/30 px-3 text-sm outline-none focus:border-cyan-400/70" />
                    <Button type="button" onClick={() => void findGame()} disabled={loading}>搜索</Button>
                  </div>
                  {games.length > 0 && <div className="mt-2 space-y-1">{games.map((game) => <button key={game.appid} type="button" onClick={() => void selectGame(game)} className="block w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-left text-sm hover:border-cyan-400/40">{game.name} <span className="text-slate-500">({game.appid})</span></button>)}</div>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-500">版本 A（较早）</label>
                  <select value={eventA} onChange={(e) => setEventA(e.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-cyan-400/20 bg-slate-950 px-3 text-sm" disabled={!events.length}>
                    <option value="">选择较早版本</option>{events.map((event) => <option key={event.event_id} value={event.event_id}>{event.event_date} · {event.event_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-500">版本 B（较新）</label>
                  <select value={eventB} onChange={(e) => setEventB(e.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-cyan-400/20 bg-slate-950 px-3 text-sm" disabled={!events.length}>
                    <option value="">选择较新版本</option>{events.map((event) => <option key={event.event_id} value={event.event_id}>{event.event_date} · {event.event_name}</option>)}
                  </select>
                </div>
                <Button type="button" variant="secondary" onClick={() => void refreshEvents()} disabled={!appId || loading || syncing}>{syncing ? '正在同步…' : '同步版本列表'}</Button>
              </div>

              {(syncing || syncStatus) && (
                <div className="mt-4 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-2 text-xs text-slate-400">
                  {syncing
                    ? '正在更新版本列表（不采集评论）…'
                    : `版本列表已更新：扫描 ${syncStatus?.news_scanned ?? 0} 条，新增 ${syncStatus?.events_created ?? 0} 个，修复 ${syncStatus?.events_resolved ?? 0} 个。`}
                </div>
              )}

              {appId && <div className="mt-5 grid gap-4 border-t border-white/10 pt-5 md:grid-cols-4">
                <div><label className="text-xs uppercase tracking-wider text-slate-500">主窗口</label><select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value) as 3 | 7 | 14)} className="mt-2 min-h-11 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm"><option value={3}>前后 3 天</option><option value={7}>前后 7 天</option><option value={14}>前后 14 天</option></select></div>
                <div><label className="text-xs uppercase tracking-wider text-slate-500">每组原始评论上限</label><select value={maxPerCohort} onChange={(e) => setMaxPerCohort(Number(e.target.value) as typeof maxPerCohort)} className="mt-2 min-h-11 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm">{[500,1000,2000,5000,10000].map((n) => <option key={n} value={n}>{n.toLocaleString()} 条 / 组</option>)}</select></div>
                <div><label className="text-xs uppercase tracking-wider text-slate-500">分析方式</label><select value={mode} onChange={(e) => setMode(e.target.value as VersionComparisonAnalysisMode)} className="mt-2 min-h-11 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm"><option value="raw_only">数据对比</option><option value="semantic">数据 + 语义</option></select></div>
                <div><label className="text-xs uppercase tracking-wider text-slate-500">语义分析总预算</label><select value={semanticBudget} onChange={(e) => setSemanticBudget(Number(e.target.value))} disabled={mode === 'raw_only'} className="mt-2 min-h-11 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm disabled:opacity-40">{[1000,2000,4000,8000].map((n) => <option key={n} value={n}>{n.toLocaleString()} 条</option>)}</select></div>
              </div>}
            </Card>

            {error && <div className="rounded-xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{error}</div>}
            {restoringRun && <Card variant="glass" className="py-4"><div className="flex items-center gap-3"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-300"/><p className="text-sm text-slate-300">正在恢复已保存的版本对比报告…</p></div></Card>}

            {plan && <Card variant="glass">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">对比范围</p><h2 className="mt-1 text-xl font-semibold text-white">{gameName || `App ${plan.app_id}`} · 四个时间窗口</h2></div>
                <div className="flex gap-2"><Badge variant="default">{plan.window_days} 天主窗口</Badge><Badge variant={plan.confounder_risk === 'clean' ? 'success' : 'warning'}>{plan.confounder_risk === 'clean' ? '未发现窗口内事件干扰' : `${plan.confounders.length} 个窗口内事件`}</Badge></div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{Object.entries(plan.cohorts).map(([key, value]) => <div key={key} className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-medium text-cyan-200">{COHORT_LABELS[key as keyof typeof COHORT_LABELS]}</p><p className="mt-2 text-sm text-slate-300">{dateTime(value.start_time)} → {dateTime(value.end_time_exclusive)}</p><p className="mt-1 text-xs text-slate-500">{value.boundary_mode === 'event_day_excluded' ? '排除版本当天' : '按精确发布时间切分'}</p></div>)}</div>
              <div className="mt-5 flex justify-end border-t border-white/10 pt-4"><Button type="button" onClick={() => void start()} disabled={loading || !request}>{loading ? '正在准备…' : mode === 'raw_only' ? '开始数据对比' : '开始数据 + 语义对比'}</Button></div>
            </Card>}

            {run?.status === 'running' && <Card variant="glass"><div className="flex items-center gap-3"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-300"/><div><p className="font-medium text-white">{phaseText[run.phase || ''] || '正在执行版本对比'}</p>{acquisitionProgress?.stage === 'acquiring_population' && <><p className="mt-2 text-sm text-cyan-200">评论采集：{acquisitionProgress.completed ?? 0}/{acquisitionProgress.total ?? 4} · {acquisitionProgress.cohort ? COHORT_LABELS[acquisitionProgress.cohort] : '准备中'}{acquisitionProgress.reviews_collected != null ? ` · ${acquisitionProgress.reviews_collected.toLocaleString()} 条` : ''}{acquisitionProgress.source ? ` · ${acquisitionProgress.source === 'cache' ? '本地数据' : 'Steam'}` : ''}</p>{completedAcquisition.length > 0 && <p className="mt-1 text-xs text-slate-400">共 {acquiredReviewCount.toLocaleString()} 条 · 本地 {cacheCohortCount} 组 · 新采集 {steamCohortCount} 组</p>}</>}</div></div></Card>}

            {metrics && raw && <>
              <Card variant="gradient">
                <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">版本对比报告</p><h2 className="mt-1 text-2xl font-semibold text-white">{metrics.event_a.event_name} <span className="text-slate-600">对比</span> {metrics.event_b.event_name}</h2><p className="mt-2 text-sm text-slate-400">游戏 ID {metrics.event_a.app_id} · {metrics.event_a.event_date} → {metrics.event_b.event_date} · {metrics.window_days} 天主窗口</p></div><div className="flex flex-wrap gap-2"><Badge variant={metrics.coverage_status === 'COMPLETE' ? 'success' : 'warning'}>{metrics.coverage_status === 'COMPLETE' ? '覆盖完整' : '覆盖不完整'}</Badge><Badge variant="default">{metrics.analysis_mode === 'raw_only' ? '仅数据对比' : '语义对比'}</Badge>{run && <Badge variant="default">已保存 · {run.run_id.slice(0, 8)}</Badge>}</div></div>
                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{cohortEntries.map(([key, value]) => <div key={key} className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-medium text-slate-400">{COHORT_LABELS[key]}</p><div className="mt-4 flex items-end justify-between"><div><p className="text-3xl font-semibold text-white">{pct(value.recommendation_rate)}</p><p className="mt-1 text-xs text-slate-500">推荐率</p></div><div className="text-right text-xs text-slate-400"><p>{value.reviews.toLocaleString()} 条评论</p><p className="mt-1">95% 置信区间 {pct(value.recommendation_ci95?.[0])}–{pct(value.recommendation_ci95?.[1])}</p></div></div></div>)}</div>
              </Card>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><DeltaTile label="版本 A · 更新前后" value={raw.deltas.a_pre_to_post_pp}/><DeltaTile label="版本 B · 更新前后" value={raw.deltas.b_pre_to_post_pp}/><DeltaTile label="更新后 · B − A" value={raw.deltas.b_post_minus_a_post_pp}/><DeltaTile label="相对变化 · ΔΔ" value={raw.deltas.difference_in_differences_pp} emphasis/></div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card variant="glass"><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">窗口稳健性</p><h3 className="mt-1 text-lg font-semibold text-white">3 / 7 / 14 天窗口敏感性</h3><div className="mt-4 space-y-3">{metrics.window_sensitivity.map((row) => <div key={row.window_days} className="grid grid-cols-[52px_1fr_1fr_1fr] items-center gap-2 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-3 text-xs sm:text-sm"><span className="font-medium text-white">{row.window_days} 天</span><span className="text-slate-400">A 变化 {pp(row.a_pre_to_post_pp)}</span><span className="text-slate-400">B 变化 {pp(row.b_pre_to_post_pp)}</span><span className="text-cyan-200">相对变化 {pp(row.difference_in_differences_pp)}</span></div>)}</div></Card>
                <Card variant="glass"><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">样本检查</p><h3 className="mt-1 text-lg font-semibold text-white">样本可比性</h3><div className="mt-4 space-y-3">{Object.entries(metrics.comparability).map(([name, result]) => { const level = result.composition_comparability?.level || result.comparability?.level; const label = name === 'language' ? '语言构成' : name === 'language_plus_playtime' ? '语言与游玩时长构成' : '评论构成'; return <div key={name} className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/20 px-3 py-3"><span className="text-sm text-slate-300">{label}</span><Badge variant={level === 'high' ? 'success' : level === 'low' ? 'warning' : 'default'}>{levelLabel(level)}</Badge></div>; })}</div></Card>
              </div>

              {metrics.confounders.length > 0 && <Card variant="glass"><p className="text-xs uppercase tracking-[0.2em] text-amber-300">其他版本事件</p><h3 className="mt-1 text-lg font-semibold text-white">窗口内还有其他事件</h3><div className="mt-3 grid gap-2 md:grid-cols-2">{metrics.confounders.map((item, index) => { const severity = item.severity === 'major' ? '较强干扰' : item.severity === 'minor' ? '轻微干扰' : '其他'; return <div key={`${item.event_id}-${index}`} className="rounded-lg border border-amber-400/20 bg-amber-950/20 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium text-amber-100">{item.event_name || versionEventTypeLabel(item.event_type)}</p><Badge variant="warning">{severity}</Badge></div><p className="mt-1 text-xs text-amber-200/60">{item.event_date} · {versionEventTypeLabel(item.event_type)}</p></div>; })}</div></Card>}

              {metrics.semantic_sample_manifest && <Card variant="glass"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">样本说明</p><h3 className="mt-1 text-lg font-semibold text-white">统一可比语义样本</h3></div><Badge variant={metrics.semantic_sample_manifest.status === 'ready' ? 'success' : 'warning'}>{metrics.semantic_sample_manifest.status === 'ready' ? '已就绪' : '支持不足'}</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricTile label="总预算" value={metrics.semantic_sample_manifest.total_budget.toLocaleString()}/><MetricTile label="每组目标" value={metrics.semantic_sample_manifest.target_per_cohort.toLocaleString()}/><MetricTile label="共同分层数" value={metrics.semantic_sample_manifest.common_support_strata.length.toLocaleString()}/><MetricTile label="推荐状态配平" value={metrics.semantic_sample_manifest.outcome_balanced ? '是' : '否'} note="不会强行配平推荐与不推荐评论"/></div></Card>}

              {metrics.semantic && <><TopicTable title="问题变化" rows={metrics.semantic.problems} sampleCounts={metrics.semantic.sample_counts}/><TopicTable title="需求变化" rows={metrics.semantic.requests} sampleCounts={metrics.semantic.sample_counts}/><TopicTable title="正向主题变化" rows={metrics.semantic.positives} sampleCounts={metrics.semantic.sample_counts}/></>}

              <Card variant="glass"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">结果说明</p><p className="mt-2 text-sm text-slate-400">变化差异仅描述评论表现，不代表因果关系。</p>{metrics.warnings?.length > 0 && <div className="mt-3 space-y-1 text-xs text-slate-500">{metrics.warnings.map((warning) => <p key={warning}>• {warningLabel(warning)}</p>)}</div>}</Card>
            </>}
          </div>
        </div>
      </PageTransition>
    </AppLayout>
  );
}
