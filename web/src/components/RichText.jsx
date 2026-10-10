import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { languageLabel, parseRichText, splitComment } from "../lib/richtext.js";

/** Shows text with line breaks kept, and code in proper code blocks. */
export default function RichText({ text, className = "" }) {
  const parts = parseRichText(text);
  return (
    <div className={`rich ${className}`}>
      {parts.map((p, i) =>
        p.type === "code" ? (
          <CodeBlock key={i} code={p.content} lang={p.lang} />
        ) : (
          <p key={i} className="rich-text">
            {p.content}
          </p>
        )
      )}
    </div>
  );
}

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="code-block">
      <div className="code-head">
        <span>{languageLabel(lang)}</span>
        <button type="button" className="code-copy" onClick={copy} aria-label="Copy code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>
          {code.split("\n").map((line, i) => {
            const [src, comment] = splitComment(line, lang);
            return (
              <span key={i} className="code-line">
                {src}
                {comment && <span className="code-comment">{comment}</span>}
                {"\n"}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
