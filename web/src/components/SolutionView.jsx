import { useState } from "react";
import { ChevronDown, Lightbulb, Target } from "lucide-react";

export default function SolutionView({ solution }) {
  const [showSteps, setShowSteps] = useState(true);

  return (
    <div className="solution">
      <div className="answer">
        <div className="section-label">
          <Target size={14} /> Answer
        </div>
        <p>{solution.answer}</p>
      </div>

      {solution.steps.length > 0 && (
        <div className="steps">
          <button className="section-toggle" onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps}>
            <span className="section-label">Step-by-step ({solution.steps.length})</span>
            <ChevronDown size={16} className={showSteps ? "chev open" : "chev"} />
          </button>
          {showSteps && (
            <ol>
              {solution.steps.map((s, i) => (
                <li key={i}>
                  <span className="step-n">{i + 1}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <p>{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {solution.explanation && (
        <div className="explanation">
          <div className="section-label">Why it works</div>
          <p>{solution.explanation}</p>
        </div>
      )}

      {solution.tips?.length > 0 && (
        <div className="tips">
          <div className="section-label">
            <Lightbulb size={14} /> Exam tips
          </div>
          <ul>
            {solution.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
