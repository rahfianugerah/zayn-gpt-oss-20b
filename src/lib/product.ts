export const PRODUCT_NAME = "Zayn";

// A 512px crop of the mascot's face from public/zayn-gpt-oss-20b.png, small enough for every avatar
export const LOGO_SRC = "/zayn.webp";

// The same names the server reads as slash commands, in server/main.py TASK_PROMPTS
export const COMMANDS = [
  { name: "general", description: "Answer the question directly" },
  { name: "explain", description: "Explain what the code does and where it can break" },
  { name: "fix", description: "Return the fixed code only" },
  { name: "docstring", description: "Add docstrings and type hints" },
  { name: "refactor", description: "Restructure without changing the public API" },
  { name: "review", description: "Review for correctness, security, and tests" },
  { name: "optimize", description: "Make it faster and simpler, same behavior" },
  { name: "testgen", description: "Write tests for edge cases and error paths" },
  { name: "translate", description: "Translate to another language" },
  { name: "generate", description: "Generate exactly the format asked for" },
  { name: "material", description: "Write study material you can read, copy, or download" },
  { name: "flashcards", description: "Make a flashcard deck to test yourself" },
] as const;

// The two study features, each a button that puts the box in a mode. The command is added on send
export const STUDY_MODES = [
  {
    command: "material",
    label: "Material",
    placeholder: "What material do you need? For example, a beginner guide to Python decorators",
  },
  {
    command: "flashcards",
    label: "Flashcards",
    placeholder: "What do you want to be tested on? For example, SQL joins, 10 cards",
  },
] as const;

export type StudyMode = (typeof STUDY_MODES)[number]["command"];

// Shown on an empty chat. Most start with a command, which teaches it, and end on a new line,
// ready for the code to be pasted
export const SUGGESTIONS = [
  { label: "Explain async/await", prompt: "/explain How does async/await work in JavaScript, and when do two awaits run in parallel?" },
  { label: "Fix an IndexError", prompt: "/fix My Python loop raises IndexError: list index out of range. Here is the code:\n" },
  { label: "Review my function", prompt: "/review Review this function for bugs, edge cases, and naming:\n" },
  { label: "Write pytest tests", prompt: "/testgen Write pytest tests, including the edge cases, for this function:\n" },
  { label: "Refactor nested ifs", prompt: "/refactor Turn these nested if-else blocks into early returns:\n" },
  { label: "Python to TypeScript", prompt: "/translate Translate this Python function to TypeScript:\n" },
  { label: "Find duplicate rows in SQL", prompt: "Write a PostgreSQL query that finds duplicate emails in a users table." },
  { label: "Explain a regex", prompt: "/explain Explain what each part of this regular expression matches:\n" },
] as const;

/** Split a leading known command off a message, mirroring split_command on the server. */
export function splitCommand(content: string): [string | null, string] {
  const match = /^\/(\w+)\b\s*/.exec(content);
  if (match && COMMANDS.some((command) => command.name === match[1])) {
    return [match[1], content.slice(match[0].length)];
  }
  return [null, content];
}
