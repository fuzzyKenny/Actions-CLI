export function generateActions(title: string): string[] {
  const normalized = title.trim().toLowerCase();
  const subject = cleanedSubject(normalized);

  if (hasAny(normalized, ["study", "learn", "revise", "exam", "prepare"])) {
    return [
      `Read 10 pages of ${subject} notes`,
      `Write a short summary of ${subject}`,
      `Solve 5 ${subject} questions`
    ];
  }

  if (hasAny(normalized, ["project", "build", "create", "feature", "route", "api", "app"])) {
    return [
      `Write down the smallest part of ${subject} to build first`,
      `Implement the first working part of ${subject}`,
      `Run and check the result for ${subject}`
    ];
  }

  return [
    `Spend 25 minutes on ${subject}`,
    `Finish one small part of ${subject}`,
    `Review what is left for ${subject}`
  ];
}

function hasAny(value: string, words: string[]): boolean {
  return words.some((word) => value.includes(word));
}

function cleanedSubject(value: string): string {
  const subject = value
    .replace(/^(study|learn|revise|prepare for|prepare|work on|build|create)\s+/i, "")
    .trim();

  return subject || "this task";
}
