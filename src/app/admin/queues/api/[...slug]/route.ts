// ============================================================
// src/app/admin/queues/api/[...slug]/route.ts
//
// BullMQ JSON API — powers the /admin/queues page.
//
// Endpoints (all prefixed /admin/queues/api/):
//   GET  queues                           → list all queues + job counts
//   GET  queue/:name?status=&page=        → queue detail + jobs
//   POST queue/:name/retry-all            → retry all failed jobs
//   POST queue/:name/pause                → pause queue
//   POST queue/:name/resume               → resume queue
//   POST queue/:name/clean                → clean completed jobs
//   POST job/:name/:id/retry              → retry single job
//   POST job/:name/:id/delete             → delete single job
//
// Auth: enforced by src/app/admin/layout.tsx (verifyAdminSession)
// ============================================================

import { Queue } from "bullmq";
import { NextRequest, NextResponse } from "next/server";
import { QUEUES } from "@/lib/queue";

function getRedisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    db:
      parsed.pathname && parsed.pathname !== "/"
        ? parseInt(parsed.pathname.slice(1), 10)
        : 0,
  };
}

function getQueue(name: string) {
  return new Queue(name, { connection: getRedisConnection() });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const path = slug.join("/");

  // GET queues
  if (path === "queues") {
    const data = await Promise.all(
      Object.values(QUEUES).map(async (name) => {
        const q = getQueue(name);
        const [counts, isPaused] = await Promise.all([
          q.getJobCounts("active", "waiting", "completed", "failed", "delayed", "paused"),
          q.isPaused(),
        ]);
        await q.close();
        return { name, counts, isPaused };
      })
    );
    return NextResponse.json(data);
  }

  // GET queue/:name
  const queueMatch = path.match(/^queue\/([^/]+)$/);
  if (queueMatch) {
    const name = decodeURIComponent(queueMatch[1]);
    const status =
      (req.nextUrl.searchParams.get("status") as
        | "active" | "waiting" | "completed" | "failed" | "delayed" | "paused") || "failed";
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10));
    const pageSize = 20;
    const start = (page - 1) * pageSize;

    const q = getQueue(name);
    const [jobs, counts, isPaused] = await Promise.all([
      q.getJobs([status], start, start + pageSize - 1),
      q.getJobCounts("active", "waiting", "completed", "failed", "delayed", "paused"),
      q.isPaused(),
    ]);

    const jobData = jobs.map((j) => ({
      id: j.id,
      name: j.name,
      data: j.data,
      attemptsMade: j.attemptsMade,
      failedReason: j.failedReason,
      stacktrace: j.stacktrace?.slice(0, 3),
      returnvalue: j.returnvalue,
      timestamp: j.timestamp,
      processedOn: j.processedOn,
      finishedOn: j.finishedOn,
    }));

    await q.close();
    return NextResponse.json({ name, counts, isPaused, jobs: jobData, page, pageSize });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const path = slug.join("/");

  const retryAllMatch = path.match(/^queue\/([^/]+)\/retry-all$/);
  if (retryAllMatch) {
    const q = getQueue(decodeURIComponent(retryAllMatch[1]));
    const jobs = await q.getJobs(["failed"]);
    await Promise.all(jobs.map((j) => j.retry("failed")));
    await q.close();
    return NextResponse.json({ ok: true, retried: jobs.length });
  }

  const pauseMatch = path.match(/^queue\/([^/]+)\/pause$/);
  if (pauseMatch) {
    const q = getQueue(decodeURIComponent(pauseMatch[1]));
    await q.pause();
    await q.close();
    return NextResponse.json({ ok: true });
  }

  const resumeMatch = path.match(/^queue\/([^/]+)\/resume$/);
  if (resumeMatch) {
    const q = getQueue(decodeURIComponent(resumeMatch[1]));
    await q.resume();
    await q.close();
    return NextResponse.json({ ok: true });
  }

  const cleanMatch = path.match(/^queue\/([^/]+)\/clean$/);
  if (cleanMatch) {
    const q = getQueue(decodeURIComponent(cleanMatch[1]));
    await q.clean(0, 1000, "completed");
    await q.close();
    return NextResponse.json({ ok: true });
  }

  const retryMatch = path.match(/^job\/([^/]+)\/([^/]+)\/retry$/);
  if (retryMatch) {
    const q = getQueue(decodeURIComponent(retryMatch[1]));
    const job = await q.getJob(retryMatch[2]);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const state = await job.getState();
    await job.retry(state === "completed" ? "completed" : "failed");
    await q.close();
    return NextResponse.json({ ok: true });
  }

  const deleteMatch = path.match(/^job\/([^/]+)\/([^/]+)\/delete$/);
  if (deleteMatch) {
    const q = getQueue(decodeURIComponent(deleteMatch[1]));
    const job = await q.getJob(deleteMatch[2]);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    await job.remove();
    await q.close();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
