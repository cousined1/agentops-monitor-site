import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description: "Notes on AI agent observability, cost governance, and audit trails.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  return (
    <main>
      <section>
        <p className="eyebrow">Blog</p>
        <h1>Notes from the agent-operations desk.</h1>
        <p className="lede">
          Pre-launch. Posts will land here once we are out of stealth.
        </p>
      </section>

      <section>
        <h2>Coming topics</h2>
        <ul>
          <li>Budget caps as a deployment gate, not a dashboard widget</li>
          <li>Why pre-launch pricing is honest pricing</li>
          <li>The four-pain model: see, explain, cap, audit</li>
          <li>Replay before review: traces as a PR check</li>
          <li>What "audit trail" actually means at 2 a.m.</li>
        </ul>
      </section>

      <section>
        <h2>Stay in the loop</h2>
        <p>
          <a className="cta cta-primary" href="/signup">Create an account</a>{" "}
          <a className="cta cta-ghost" href="/contact">Contact</a>
        </p>
      </section>
    </main>
  );
}
