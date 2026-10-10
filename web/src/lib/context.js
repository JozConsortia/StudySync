// Questions such as "1.2 Calculate the velocity of the block..." rely on information given in 1.1.
// When solving, the earlier questions of the same section are sent along as background.

const mainNumber = (n) => String(n ?? "").trim().split(/[.(\s]/)[0];

export function sectionContext(questions, question) {
  const index = questions.findIndex((q) => q.id === question.id);
  const main = mainNumber(question.number);
  if (index <= 0 || !main) return "";
  return questions
    .slice(0, index)
    .filter((q) => mainNumber(q.number) === main)
    .slice(-4)
    .map((q) => `${q.number}: ${q.text}`)
    .join("\n")
    .slice(-6000);
}
