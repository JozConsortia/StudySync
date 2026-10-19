import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Award, BookOpen, Check, CheckCircle2, Eye, LoaderCircle, PenLine, RotateCcw, X, Zap } from "lucide-react";
import { api } from "../lib/api.js";
import { firstOpen, localDay, outcome, untilMidnight } from "../lib/challenges.js";
import BotAvatar from "./BotAvatar.jsx";
import BotMessage from "./BotMessage.jsx";
import RichText from "./RichText.jsx";
import { MicButton } from "./VoiceButtons.jsx";

const LETTERS = ["A", "B", "C", "D"];
const HEADLINE = { correct: "Correct! 🎉", partly: "Nearly there 👍", incorrect: "Not quite" };

/** Daily challenges: five a day, marked and rated, with XP, levels and a streak. */
export default function ChallengesView() {
  const [day, setDay] = useState(localDay());
  const [data, setData] = useState(null); // { challenge, stats }
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const res = await api.challenges.today(day);
      setData(res);
      setIndex(firstOpen(res.challenge.items));
      setStatus("ready");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }, [day]);

  useEffect(() => {
    setReviewing(false);
    load();
  }, [load]);

  // A new day started while the tab was open in the background.
  useEffect(() => {
    const check = () => document.visibilityState === "visible" && setDay(localDay());
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  if (status === "loading" && !data) {
    return (
      <div className="card empty challenge-prep">
        <BotAvatar size={72} thinking />
        <h2>Preparing today&apos;s challenges…</h2>
        <p className="muted">
          I&apos;m picking fresh questions from the subjects you&apos;ve been studying. This takes a few seconds, once a day.
        </p>
      </div>
    );
  }
  if (status === "error" && !data) {
    return (
      <div className="card empty">
        <BotAvatar size={56} />
        <h2>Couldn&apos;t load today&apos;s challenges</h2>
        <div className="alert">{error}</div>
        <button className="btn btn-primary" onClick={load}>
          <RotateCcw size={16} /> Try again
        </button>
      </div>
    );
  }

  const { challenge, stats } = data;
  const items = challenge.items;
  const item = items[Math.min(index, items.length - 1)];
  const showSummary = challenge.completed && !reviewing;

  const next = () => {
    if (challenge.completed) return setReviewing(false);
    const after = items.findIndex((c, i) => i > index && !c.result);
    setIndex(after !== -1 ? after : firstOpen(items));
  };

  return (
    <div className="challenges">
      <Hero
        challenge={challenge}
        stats={stats}
        index={index}
        onPick={(i) => {
          setReviewing(true);
          setIndex(i);
        }}
      />
      <div className="challenge-layout">
        {showSummary ? (
          <Summary
            challenge={challenge}
            stats={stats}
            onReview={() => {
              setReviewing(true);
              setIndex(0);
            }}
          />
        ) : (
          <ChallengeCard
            key={`${challenge.day}:${item.id}`}
            day={challenge.day}
            item={item}
            position={items.indexOf(item)}
            total={items.length}
            onAnswered={(res) => {
              // Stay on this challenge to show its result, even when it was the last one.
              setReviewing(true);
              setData(res);
            }}
            onPrev={index > 0 ? () => setIndex(index - 1) : null}
            onNext={next}
            allDone={challenge.completed}
          />
        )}
        <Week stats={stats} />
      </div>
    </div>
  );
}

function Hero({ challenge, stats, index, onPick }) {
  const date = new Date(`${challenge.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="challenge-hero">
      <div className="challenge-hero-text">
        <span className="kicker">Daily challenge · {date}</span>
        <h1>{challenge.completed ? "All done for today!" : "Five challenges. One streak."}</h1>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="emoji">🔥</span>
            <div>
              <strong>{stats.streak}</strong>
              <small>day streak</small>
            </div>
          </div>
          <div className="hero-stat">
            <span className="emoji">⭐</span>
            <div>
              <strong>Level {stats.level}</strong>
              <small>{stats.xp} XP total</small>
            </div>
          </div>
          <div className="hero-stat">
            <span className="emoji">🏆</span>
            <div>
              <strong>{stats.bestStreak}</strong>
              <small>best streak</small>
            </div>
          </div>
        </div>
        <div className="xp">
          <div className="xp-labels">
            <small>
              {stats.levelXp} / {stats.xpPerLevel} XP to level {stats.level + 1}
            </small>
            <small>
              {challenge.score} / {challenge.maxScore} today
            </small>
          </div>
          <div className="xp-track">
            <div className="xp-fill" style={{ width: `${(stats.levelXp / stats.xpPerLevel) * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="challenge-dots" role="tablist" aria-label="Today's challenges">
        {challenge.items.map((c, i) => {
          const o = outcome(c);
          return (
            <button
              key={c.id}
              className={`challenge-dot ${o || ""} ${i === index ? "current" : ""}`}
              onClick={() => onPick(i)}
              aria-label={`Challenge ${i + 1}${o ? `, ${o}` : ""}`}
            >
              {o ? o === "incorrect" ? <X size={15} /> : <Check size={15} /> : i + 1}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ChallengeCard({ day, item, position, total, onAnswered, onPrev, onNext, allDone }) {
  const [choice, setChoice] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const result = item.result;
  const o = outcome(item);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      onAnswered(await api.challenges.answer(day, item.id, item.type === "mcq" ? { choice } : { answer: draft }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card challenge-card">
      <header className="challenge-meta">
        <span className="muted">
          Challenge {position + 1} of {total}
        </span>
        <span className="chip">
          <BookOpen size={12} /> {item.subject}
        </span>
        <span className="chip">
          {item.type === "mcq" ? <CheckCircle2 size={12} /> : <PenLine size={12} />}
          {item.type === "mcq" ? "Multiple choice" : "Short answer"}
        </span>
        <span className="spacer" />
        <span className="chip xp-chip">
          <Zap size={12} /> +{item.points} XP
        </span>
      </header>
      <h2>{item.title}</h2>
      <RichText text={item.question} className="challenge-question" />

      {item.type === "mcq" ? (
        <div className="options">
          {item.options.map((opt, i) => {
            const picked = result ? result.choice === i : choice === i;
            const right = result && item.answerIndex === i;
            const wrong = result && picked && !right;
            return (
              <button
                key={i}
                className={`option ${picked && !result ? "picked" : ""} ${right ? "right" : ""} ${wrong ? "wrong" : ""}`}
                disabled={!!result || busy}
                onClick={() => setChoice(i)}
              >
                <span className="letter">{right ? <Check size={14} /> : wrong ? <X size={14} /> : LETTERS[i]}</span>
                <span>{opt}</span>
              </button>
            );
          })}
        </div>
      ) : result ? (
        <div className="your-answer">
          <span className="section-label">Your answer</span>
          <p>{result.answer}</p>
        </div>
      ) : (
        <div className="followup-composer challenge-composer">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={4000}
            disabled={busy}
            placeholder="Type your answer here…"
            aria-label="Your answer"
          />
          <MicButton onText={(text) => setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))} onError={setError} disabled={busy} />
        </div>
      )}

      {busy && item.type === "short" && <BotMessage thinking thinkingText="Marking your answer" />}
      {error && <div className="alert">{error}</div>}

      {!result && (
        <button
          className="btn btn-primary btn-block"
          onClick={submit}
          disabled={busy || (item.type === "mcq" ? choice === null : !draft.trim())}
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}
          {item.type === "mcq" ? "Check answer" : "Submit answer"}
        </button>
      )}

      {result && (
        <div className="challenge-result">
          <div className={`result-head ${o}`}>
            <span className="score-bubble">
              {item.type === "mcq" ? (result.correct ? 10 : 0) : result.outOf10}
              <small>/10</small>
            </span>
            <div>
              <strong>{HEADLINE[o]}</strong>
              <span className="muted">+{result.score} XP earned</span>
            </div>
          </div>
          {result.feedback && (
            <BotMessage>
              <p>{result.feedback}</p>
            </BotMessage>
          )}
          {item.modelAnswer && (
            <div className="explanation">
              <div className="section-label">Model answer</div>
              <RichText text={item.modelAnswer} />
            </div>
          )}
          {item.explanation && (
            <div className="explanation">
              <div className="section-label">Why</div>
              <RichText text={item.explanation} />
            </div>
          )}
        </div>
      )}

      <div className="challenge-nav">
        {onPrev ? (
          <button className="btn btn-ghost btn-sm" onClick={onPrev}>
            <ArrowLeft size={15} /> Previous
          </button>
        ) : (
          <span />
        )}
        {result && (
          <button className="btn btn-primary btn-sm" onClick={onNext}>
            {allDone ? <Award size={15} /> : <ArrowRight size={15} />}
            {allDone ? "See today's rating" : "Next challenge"}
          </button>
        )}
      </div>
    </article>
  );
}

function Summary({ challenge, stats, onReview }) {
  const [countdown, setCountdown] = useState(untilMidnight());
  useEffect(() => {
    const t = setInterval(() => setCountdown(untilMidnight()), 30000);
    return () => clearInterval(t);
  }, []);
  const r = challenge.rating;
  return (
    <article className="card challenge-summary">
      <span className="section-label">Today&apos;s rating</span>
      <div className="stars" aria-label={`${r.stars} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= r.stars ? "on" : ""} style={{ animationDelay: `${n * 90}ms` }}>
            ★
          </span>
        ))}
      </div>
      <h2>{r.label}</h2>
      <p className="muted">
        {challenge.score} / {challenge.maxScore} points · {r.percent}%
      </p>
      <div className="summary-stats">
        <div>
          <strong>+{challenge.score}</strong>
          <small>XP today</small>
        </div>
        <div>
          <strong>🔥 {stats.streak}</strong>
          <small>day streak</small>
        </div>
        <div>
          <strong>{stats.bestStreak}</strong>
          <small>best streak</small>
        </div>
      </div>
      <p className="muted">New challenges in {countdown}. Come back tomorrow to keep your streak alive!</p>
      <button className="btn btn-sm" onClick={onReview}>
        <Eye size={15} /> Review today&apos;s answers
      </button>
    </article>
  );
}

function Week({ stats }) {
  const today = localDay();
  return (
    <aside className="card week-card">
      <div className="week-head">
        <strong>Your week</strong>
        <small className="muted">
          {stats.daysCompleted} {stats.daysCompleted === 1 ? "day" : "days"} completed
        </small>
      </div>
      <div className="week">
        {stats.week.map((d) => {
          const pct = d.maxScore ? d.score / d.maxScore : 0;
          return (
            <div key={d.day} className={`week-col ${d.day === today ? "today" : ""}`}>
              <small className="week-stars">{d.completed ? `${d.stars}★` : ""}</small>
              <div className="week-track">
                {d.score > 0 && (
                  <div className={`week-fill ${d.completed ? "" : "partial"}`} style={{ height: `${Math.max(8, pct * 100)}%` }} />
                )}
              </div>
              <small>{new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</small>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
