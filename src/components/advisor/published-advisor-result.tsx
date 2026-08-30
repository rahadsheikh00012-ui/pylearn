import Link from "next/link";
import { AdvisorRecommendationCards } from "./recommendation-cards";
import type { AdvisorAnswer, AdvisorAttempt } from "./types";

function ObjectiveAnswerResult({ answer, index }: { answer: AdvisorAnswer; index: number }) {
  return <article className="panel p-6">
    <QuestionHeading answer={answer} index={index} />
    <div className="mt-4 space-y-3">{answer.options.map(option => {
      const correct = option.toLowerCase() === answer.correct_answer?.toLowerCase();
      const submitted = option.toLowerCase() === answer.submitted_answer.toLowerCase();
      const tone = correct ? "border-green-500 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200" : submitted && !answer.is_correct ? "border-red-500 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200" : "border-[var(--border)] opacity-70";
      return <div className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${tone}`} key={option}>
        <span>{option}</span><span className="text-xs font-semibold">{correct ? "Correct answer" : submitted ? "Your answer" : ""}</span>
      </div>;
    })}</div>
    {!answer.options.length && <div className="mt-4 grid gap-2 text-sm"><p><strong>Your answer:</strong> {answer.submitted_answer || "No answer provided"}</p><p><strong>Correct answer:</strong> {answer.correct_answer}</p></div>}
    <p className="muted mt-4 text-sm">Awarded {answer.awarded_points} of {answer.max_points} points</p>
  </article>;
}

function WrittenAnswerResult({ answer, index }: { answer: AdvisorAnswer; index: number }) {
  return <article className="panel p-6">
    <QuestionHeading answer={answer} index={index} />
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide muted">Your response</p>
      <p className="mt-2 whitespace-pre-wrap">{answer.submitted_answer || "No response provided"}</p>
    </div>
    <p className="mt-3 text-sm font-semibold">Awarded {answer.awarded_points} of {answer.max_points} points</p>
    {answer.ai_feedback && <div className="mt-3 rounded-lg border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] p-4"><strong>Reviewed feedback</strong><p className="mt-2 text-sm leading-6">{answer.ai_feedback}</p></div>}
  </article>;
}

function QuestionHeading({ answer, index }: { answer: AdvisorAnswer; index: number }) {
  return <><h3 className="flex items-start gap-2 text-lg font-bold"><span className="text-[var(--primary)]">{index + 1}.</span>{answer.prompt}</h3><div className="mt-3 flex flex-wrap gap-2"><span className="badge">{answer.topic}</span>{answer.field_name && <span className="badge">{answer.field_name}</span>}{answer.skill_name && <span className="badge">{answer.skill_name}</span>}</div></>;
}

export function PublishedAdvisorResult({ attempt }: { attempt: AdvisorAttempt }) {
  const analysis = attempt.analysis;
  if (!analysis) return null;
  const discovery = attempt.quiz_type === "SKILL_DISCOVERY";
  return <div className="space-y-6">
    <section className="panel border-[var(--primary)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><span className="badge">Admin reviewed</span><h2 className="mt-3 text-2xl font-bold">{discovery ? "Your Skill Discovery result" : "Your Skill Development result"}</h2><p className="muted mt-2 max-w-2xl">{analysis.summary}</p></div>
        <div className="text-right"><div className="text-4xl font-bold text-[var(--primary)]">{attempt.percentage ?? "—"}%</div><div className="mt-1 font-semibold">{analysis.level ? analysis.level.toLowerCase().replace(/^./, value => value.toUpperCase()) : "Diagnostic result"}</div></div>
      </div>
      {discovery && analysis.strongest_field_name && <p className="mt-5"><strong>Strongest field:</strong> {analysis.strongest_field_name}</p>}
      {discovery && analysis.strongest_skill_names.length > 0 && <p className="mt-2"><strong>Strongest skills:</strong> {analysis.strongest_skill_names.join(", ")}</p>}
      <p className="muted mt-4 text-sm">Published {attempt.published_at ? new Date(attempt.published_at).toLocaleString() : "after administrator review"}</p>
    </section>
    <section className="grid gap-4 md:grid-cols-2">
      <div className="panel p-5"><h2 className="font-bold">Strengths</h2>{analysis.strengths.length ? <ul className="mt-3 list-disc space-y-2 pl-5">{analysis.strengths.map(value => <li key={value}>{value}</li>)}</ul> : <p className="muted mt-3 text-sm">No specific strengths were listed.</p>}</div>
      <div className="panel p-5"><h2 className="font-bold">Skill gaps</h2>{analysis.gaps.length ? <ul className="mt-3 list-disc space-y-2 pl-5">{analysis.gaps.map(value => <li key={value}>{value}</li>)}</ul> : <p className="muted mt-3 text-sm">No priority gaps were identified.</p>}</div>
    </section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Question breakdown</h2>{attempt.answers.map((answer, index) => ["MULTIPLE_CHOICE", "TRUE_FALSE"].includes(answer.question_type) ? <ObjectiveAnswerResult answer={answer} index={index} key={answer.question_id} /> : <WrittenAnswerResult answer={answer} index={index} key={answer.question_id} />)}</section>
    <section className="panel p-5"><h2 className="mb-4 text-xl font-bold">Recommended courses</h2><AdvisorRecommendationCards recommendations={analysis.recommendations} /></section>
    <Link className="btn btn-secondary" href="/learning-path">Back to AI Learning Path Advisor</Link>
  </div>;
}
