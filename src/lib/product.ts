export const PRODUCT_NAME = "Codepilot";

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
] as const;

/** Split a leading known command off a message, mirroring split_command on the server. */
export function splitCommand(content: string): [string | null, string] {
  const match = /^\/(\w+)\b\s*/.exec(content);
  if (match && COMMANDS.some((command) => command.name === match[1])) {
    return [match[1], content.slice(match[0].length)];
  }
  return [null, content];
}
