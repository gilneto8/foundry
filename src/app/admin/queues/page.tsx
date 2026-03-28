"use client";

// ============================================================
// src/app/admin/queues/page.tsx
// Native BullMQ queue dashboard — no Bull Board, no Express.
//
// Talks directly to the JSON API at /admin/queues/api/*
// Renders queue list, job table with status filter, retry/delete actions.
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Play, Pause, Trash2, RotateCcw, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type JobStatus = "active" | "waiting" | "completed" | "failed" | "delayed" | "paused";
type JobCounts = Record<JobStatus | string, number>;

interface QueueSummary {
  name: string;
  counts: JobCounts;
  isPaused: boolean;
}

interface Job {
  id: string;
  name: string;
  data: unknown;
  attemptsMade: number;
  failedReason?: string;
  stacktrace?: string[];
  returnvalue?: unknown;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

interface QueueDetail extends QueueSummary {
  jobs: Job[];
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
const API = "/admin/queues/api";

async function fetchQueues(): Promise<QueueSummary[]> {
  const r = await fetch(`${API}/queues`, { cache: "no-store" });
  return r.json();
}

async function fetchQueue(name: string, status: JobStatus, page: number): Promise<QueueDetail> {
  const r = await fetch(`${API}/queue/${encodeURIComponent(name)}?status=${status}&page=${page}`, {
    cache: "no-store",
  });
  return r.json();
}

async function apiPost(path: string) {
  const r = await fetch(`${API}/${path}`, { method: "POST" });
  return r.json();
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  waiting: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  completed: "bg-green-500/15 text-green-400 border-green-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  delayed: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  paused: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

function Badge({ status, count }: { status: string; count: number }) {
  const cls = STATUS_COLORS[status] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {status} <strong>{count}</strong>
    </span>
  );
}

function fmt(ts?: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function QueuesPage() {
  const [queues, setQueues] = useState<QueueSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<QueueDetail | null>(null);
  const [status, setStatus] = useState<JobStatus>("failed");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // ── Load queue list ────────────────────────────────────────────────────
  const loadQueues = useCallback(async () => {
    setLoading(true);
    try {
      setQueues(await fetchQueues());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQueues(); }, [loadQueues]);

  // ── Load queue detail ──────────────────────────────────────────────────
  const loadDetail = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      setDetail(await fetchQueue(selected, status, page));
    } finally {
      setLoading(false);
    }
  }, [selected, status, page]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  // ── Actions ───────────────────────────────────────────────────────────
  async function action(path: string) {
    setBusy(true);
    try {
      await apiPost(path);
      await loadQueues();
      if (selected) await loadDetail();
    } finally {
      setBusy(false);
    }
  }

  // ── Queue list view ────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Job Queues</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={loadQueues}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading && queues.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading queues…</p>
        ) : queues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No queues found. Is Redis reachable?</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {queues.map((q) => {
              const total = Object.values(q.counts).reduce((a, b) => a + b, 0);
              return (
                <div
                  key={q.name}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => { setSelected(q.name); setStatus("failed"); setPage(1); }}
                      className="text-sm font-medium text-foreground hover:underline font-mono"
                    >
                      {q.name}
                    </button>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {Object.entries(q.counts)
                        .filter(([, v]) => v > 0)
                        .map(([k, v]) => <Badge key={k} status={k} count={v} />)}
                      {total === 0 && (
                        <span className="text-xs text-muted-foreground">empty</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {q.isPaused ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => action(`queue/${encodeURIComponent(q.name)}/resume`)}
                        className="gap-1.5 text-xs"
                      >
                        <Play className="size-3.5" /> Resume
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => action(`queue/${encodeURIComponent(q.name)}/pause`)}
                        className="gap-1.5 text-xs text-muted-foreground"
                      >
                        <Pause className="size-3.5" /> Pause
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Queue detail view ──────────────────────────────────────────────────
  const STATUSES: JobStatus[] = ["failed", "active", "waiting", "completed", "delayed", "paused"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setDetail(null); }} className="gap-1.5">
            <ChevronLeft className="size-4" />Back
          </Button>
          <h2 className="font-mono text-lg font-semibold text-foreground">{selected}</h2>
          {detail?.isPaused && (
            <span className="rounded border border-zinc-500/30 bg-zinc-500/15 px-1.5 py-0.5 text-xs font-medium text-zinc-400">
              paused
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {detail?.isPaused ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => action(`queue/${encodeURIComponent(selected)}/resume`)} className="gap-1.5 text-xs">
              <Play className="size-3.5" /> Resume
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => action(`queue/${encodeURIComponent(selected)}/pause`)} className="gap-1.5 text-xs text-muted-foreground">
              <Pause className="size-3.5" /> Pause
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => action(`queue/${encodeURIComponent(selected)}/retry-all`)} className="gap-1.5 text-xs">
            <RotateCcw className="size-3.5" /> Retry All Failed
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => action(`queue/${encodeURIComponent(selected)}/clean`)} className="gap-1.5 text-xs text-muted-foreground">
            <Trash2 className="size-3.5" /> Clean Completed
          </Button>
          <Button variant="outline" size="sm" disabled={loading} onClick={loadDetail} className="gap-1.5 text-xs">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Counts */}
      {detail && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(detail.counts).map(([k, v]) => <Badge key={k} status={k} count={v} />)}
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              status === s
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
            {detail && detail.counts[s] > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                {detail.counts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Job table */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading jobs…</p>
      ) : !detail || detail.jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {status} jobs.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {detail.jobs.map((job) => (
            <div key={job.id} className="px-4 py-3 space-y-1">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{job.id}</span>
                    <span className="text-sm font-medium text-foreground truncate">{job.name}</span>
                    {job.attemptsMade > 0 && (
                      <span className="text-xs text-muted-foreground">{job.attemptsMade} attempt{job.attemptsMade !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Created {fmt(job.timestamp)}
                    {job.finishedOn && ` · Finished ${fmt(job.finishedOn)}`}
                  </div>
                  {job.failedReason && (
                    <div className="mt-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400 font-mono truncate">
                      {job.failedReason}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                    className="text-xs text-muted-foreground"
                  >
                    {expanded === job.id ? "Hide" : "Details"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => action(`job/${encodeURIComponent(selected)}/${job.id}/retry`)}
                    className="gap-1 text-xs"
                  >
                    <RotateCcw className="size-3" /> Retry
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => action(`job/${encodeURIComponent(selected)}/${job.id}/delete`)}
                    className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>

              {/* Expanded detail */}
              {expanded === job.id && (
                <div className="mt-2 space-y-2 rounded-md bg-muted/50 p-3 text-xs font-mono">
                  <div>
                    <span className="text-muted-foreground">data: </span>
                    <pre className="whitespace-pre-wrap break-all text-foreground">
                      {JSON.stringify(job.data, null, 2)}
                    </pre>
                  </div>
                  {job.stacktrace && job.stacktrace.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">stacktrace: </span>
                      <pre className="whitespace-pre-wrap break-all text-red-400">
                        {job.stacktrace.join("\n")}
                      </pre>
                    </div>
                  )}
                  {job.returnvalue !== undefined && job.returnvalue !== null && (
                    <div>
                      <span className="text-muted-foreground">returnvalue: </span>
                      <pre className="whitespace-pre-wrap break-all text-green-400">
                        {JSON.stringify(job.returnvalue, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {detail && detail.jobs.length === detail.pageSize && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <span className="flex items-center px-2 text-sm text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
