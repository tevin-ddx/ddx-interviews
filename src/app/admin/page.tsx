import Link from "next/link";
import { prisma } from "@/lib/db";
import Badge from "@/components/ui/Badge";

export default async function AdminDashboard() {
  const [questionCount, interviewCount, activeInterviews] = await Promise.all([
    prisma.question.count(),
    prisma.interview.count(),
    prisma.interview.findMany({
      where: { status: "active" },
      include: { question: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Overview of your interview platform
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Questions" value={questionCount} href="/admin/questions" />
        <StatCard label="Total Interviews" value={interviewCount} href="/admin/interviews" />
        <StatCard
          label="Active Sessions"
          value={activeInterviews.length}
          href="/admin/interviews"
          accent
        />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 px-6 py-4">
          <h2 className="font-semibold">Recent Active Sessions</h2>
        </div>
        {activeInterviews.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            No active interviews.{" "}
            <Link
              href="/admin/interviews"
              className="text-indigo-400 hover:underline"
            >
              Start one
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {activeInterviews.map((iv) => (
              <div
                key={iv.id}
                className="flex items-center justify-between px-6 py-3"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="active">Active</Badge>
                  <span className="text-sm">{iv.title}</span>
                  {iv.question && (
                    <span className="text-xs text-zinc-500">
                      — {iv.question.title}
                    </span>
                  )}
                </div>
                <Link
                  href={`/room/${iv.id}`}
                  className="text-xs text-indigo-400 hover:underline"
                >
                  Join →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link href={href}>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition-colors hover:border-zinc-700">
        <p className="text-sm text-zinc-400">{label}</p>
        <p
          className={`mt-2 text-3xl font-bold ${accent ? "text-indigo-400" : ""}`}
        >
          {value}
        </p>
      </div>
    </Link>
  );
}
