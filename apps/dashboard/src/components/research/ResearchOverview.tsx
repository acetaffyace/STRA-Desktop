'use client';

import { Card } from '@/components/ui/card';
import type { DashboardReadiness } from '@/lib/api';
import type { ResearchReport, SemanticStatus } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';

function safeStaleReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const sanitized = reason.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!sanitized || /traceback|stack trace|exception|\berror\b| at \w+[./]/i.test(sanitized)) return null;
  return sanitized;
}

export function staleReasonLabel(reason: string | null | undefined, zh: boolean): string {
  const normalized = reason?.trim().toLowerCase() || '';
  const action = zh ? '重新运行分析可以生成基于当前评论的数据。' : 'Run the analysis again to use the current review pool.';
  if (normalized.includes('review pool changed')) {
    return zh ? `当前评论池与该报告生成时相比已经变化。${action}` : `The review pool changed since this report was generated. ${action}`;
  }
  if (normalized.includes('freshness') || normalized.includes('older') || normalized.includes('expired') || normalized.includes('age') || normalized.includes('threshold')) {
    return zh ? `该报告已超过当前的新鲜度阈值。${action}` : `This report is older than the current freshness threshold. ${action}`;
  }
  const detail = safeStaleReason(reason);
  return zh
    ? `该报告可能与当前数据不完全一致。${detail ? `原因：${detail}。` : ''}${action}`
    : `This report may no longer match the current data.${detail ? ` Reason: ${detail}.` : ''} ${action}`;
}

function formatDate(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Date(value * 1000).toLocaleDateString();
}

function formatCount(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—';
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '—';
}

export function ResearchOverview({
  report,
  semanticStatus,
  readiness: _readiness,
  stale = false,
  staleReason,
}: {
  report: ResearchReport;
  semanticStatus?: SemanticStatus | null;
  readiness?: DashboardReadiness | null;
  stale?: boolean;
  staleReason?: string | null;
}) {
  const { language } = useLanguage();
  const zh = language === 'zh';
  const population = report.population;
  const contract = population?.sampling_contract;
  const languages = contract?.languages?.length ? contract.languages.join(', ') : (zh ? '全部语言' : 'All languages');
  const start = population?.coverage_start_time ?? contract?.start_time;
  const end = population?.coverage_end_time ?? contract?.end_time;
  const complete = population?.collection_complete;
  const truncated = population?.truncated_by_max_reviews;
  const recommendation = report.recommendation;
  const recommendationPopulation = recommendation?.population;
  const interval = recommendation?.model_based_interval;
  const activity = report.activity;
  const repetition = activity?.text_repetition;
  const activitySummary = activity?.summary;

  let collectionLabel = zh ? '覆盖状态未知' : 'Coverage unknown';
  let collectionClass = 'border-slate-500/30 bg-slate-500/10 text-slate-300';
  if (complete === true) {
    collectionLabel = zh ? '采集完整' : 'Collection complete';
    collectionClass = 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
  } else if (truncated) {
    collectionLabel = zh ? '达到评论上限' : 'Review limit reached';
    collectionClass = 'border-amber-400/30 bg-amber-500/10 text-amber-200';
  } else if (complete === false) {
    collectionLabel = zh ? '采集未完整' : 'Collection incomplete';
    collectionClass = 'border-amber-400/30 bg-amber-500/10 text-amber-200';
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4 px-4 pb-4" aria-label={zh ? '确定性研究结果' : 'Deterministic research results'}>
      <Card className="border-white/10 bg-slate-950/35 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{zh ? '分析范围' : 'Analysis scope'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-200">
              <span>{formatDate(start)} – {formatDate(end)}</span>
              <span className="text-slate-700">·</span>
              <span>{formatCount(population?.review_count)} {zh ? '条评论' : 'reviews'}</span>
              <span className="text-slate-700">·</span>
              <span className="text-slate-400">{languages}</span>
            </div>
          </div>
          <span className={`w-fit rounded-full border px-3 py-1 text-xs ${collectionClass}`}>{collectionLabel}</span>
        </div>
        {stale && (
          <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
            {staleReasonLabel(staleReason, zh)}
          </div>
        )}
      </Card>

      {semanticStatus?.status !== 'available' && (
        <Card className="border-cyan-400/20 bg-cyan-500/[0.05] p-4">
          <p className="text-sm font-medium text-cyan-100">{zh ? '确定性分析已完成' : 'Deterministic analysis is ready'}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {zh
              ? '未配置 LLM：统计仍可用，主题、问题和需求暂不生成。'
              : 'No LLM is configured, so semantic topics, issues, and requests are unavailable. Recommendation, interval, activity, and repetition diagnostics remain valid.'}
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-white/10 bg-slate-950/35 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{zh ? '推荐率' : 'Recommendation rate'}</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-300">{formatPercent(recommendationPopulation?.recommendation_rate)}</p>
          <p className="mt-2 text-xs text-slate-500">{formatCount(recommendationPopulation?.recommended_n)} / {formatCount(recommendationPopulation?.valid_n)} {zh ? '条推荐' : 'recommended'}</p>
        </Card>
        <Card className="border-white/10 bg-slate-950/35 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{zh ? '模型区间' : 'Model interval'}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{formatPercent(interval?.lower)} – {formatPercent(interval?.upper)}</p>
          <p className="mt-2 text-xs text-slate-500">{interval?.method || 'Wilson'} · {formatPercent(interval?.confidence_level ?? 0.95, 0)} CI</p>
        </Card>
        <Card className="border-white/10 bg-slate-950/35 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{zh ? '不推荐' : 'Not recommended'}</p>
          <p className="mt-2 text-3xl font-semibold text-rose-300">{formatCount(recommendationPopulation?.not_recommended_n)}</p>
          <p className="mt-2 text-xs text-slate-500">{zh ? '推荐/不推荐是 Steam 选择，不等于文本情感' : 'Steam choice, not text sentiment'}</p>
        </Card>
        <Card className="border-white/10 bg-slate-950/35 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{zh ? '有效总体' : 'Valid population'}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatCount(recommendationPopulation?.valid_n)}</p>
          <p className="mt-2 text-xs text-slate-500">{zh ? `缺失 ${formatCount(recommendationPopulation?.missing_n)} 条` : `${formatCount(recommendationPopulation?.missing_n)} missing`}</p>
        </Card>
      </div>

      <Card className="border-white/10 bg-slate-950/35 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{zh ? '评论活动与表达诊断' : 'Activity and expression diagnostics'}</p>
            <p className="mt-1 text-sm text-slate-300">{zh ? '这些是候选诊断信号，不自动证明刷评、操纵或因果关系。' : 'These are diagnostic signals, not proof of manipulation or causality.'}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs ${activitySummary?.activity_spike_detected ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'}`}>
            {activitySummary?.activity_spike_detected ? (zh ? '检测到活动峰值' : 'Activity spike detected') : (zh ? '未检测到活动峰值' : 'No activity spike detected')}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-slate-500">{zh ? '原始评论' : 'Raw reviews'}</p><p className="mt-1 text-lg font-medium text-white">{formatCount(activity?.population?.raw_review_count)}</p></div>
          <div><p className="text-xs text-slate-500">{zh ? '唯一评论 ID' : 'Unique review IDs'}</p><p className="mt-1 text-lg font-medium text-white">{formatCount(activity?.population?.unique_review_id_count)}</p></div>
          <div><p className="text-xs text-slate-500">{zh ? '完全重复文本' : 'Exact duplicate text'}</p><p className="mt-1 text-lg font-medium text-white">{formatPercent(repetition?.exact_duplicate_share)}</p></div>
          <div><p className="text-xs text-slate-500">{zh ? '集中表达占比' : 'Coordinated expression share'}</p><p className="mt-1 text-lg font-medium text-white">{formatPercent(repetition?.coordinated_expression_share)}</p></div>
        </div>
      </Card>
    </section>
  );
}
