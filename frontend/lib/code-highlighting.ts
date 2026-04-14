type LanguageFamily =
  | "code"
  | "data"
  | "docker"
  | "markup"
  | "markdown"
  | "script"
  | "shell"
  | "sql"
  | "style"
  | "text"

type LanguageDefinition = {
  family: LanguageFamily
  label: string
}

type TokenPattern = {
  source: string
  tokenClassName: string
}

type MatcherDefinition = {
  flags: string
  patterns: TokenPattern[]
}

type HighlightedCode = {
  html: string
  languageLabel: string
}

const LANGUAGE_DEFINITIONS = new Map<string, LanguageDefinition>([
  ["dockerfile", { family: "docker", label: "Dockerfile" }],
  ["sh", { family: "shell", label: "Shell" }],
  ["bash", { family: "shell", label: "Bash" }],
  ["zsh", { family: "shell", label: "Zsh" }],
  ["fish", { family: "shell", label: "Fish" }],
  ["env", { family: "data", label: "Env" }],
  ["ini", { family: "data", label: "INI" }],
  ["conf", { family: "data", label: "Config" }],
  ["toml", { family: "data", label: "TOML" }],
  ["yaml", { family: "data", label: "YAML" }],
  ["yml", { family: "data", label: "YAML" }],
  ["json", { family: "data", label: "JSON" }],
  ["jsonc", { family: "data", label: "JSON" }],
  ["html", { family: "markup", label: "HTML" }],
  ["htm", { family: "markup", label: "HTML" }],
  ["xml", { family: "markup", label: "XML" }],
  ["svg", { family: "markup", label: "SVG" }],
  ["md", { family: "markdown", label: "Markdown" }],
  ["mdx", { family: "markdown", label: "MDX" }],
  ["css", { family: "style", label: "CSS" }],
  ["scss", { family: "style", label: "SCSS" }],
  ["sass", { family: "style", label: "Sass" }],
  ["less", { family: "style", label: "Less" }],
  ["sql", { family: "sql", label: "SQL" }],
  ["py", { family: "script", label: "Python" }],
  ["rb", { family: "script", label: "Ruby" }],
  ["lua", { family: "script", label: "Lua" }],
  ["js", { family: "code", label: "JavaScript" }],
  ["jsx", { family: "code", label: "JSX" }],
  ["ts", { family: "code", label: "TypeScript" }],
  ["tsx", { family: "code", label: "TSX" }],
  ["mjs", { family: "code", label: "JavaScript" }],
  ["cjs", { family: "code", label: "JavaScript" }],
  ["go", { family: "code", label: "Go" }],
  ["rs", { family: "code", label: "Rust" }],
  ["java", { family: "code", label: "Java" }],
  ["kt", { family: "code", label: "Kotlin" }],
  ["c", { family: "code", label: "C" }],
  ["h", { family: "code", label: "Header" }],
  ["cpp", { family: "code", label: "C++" }],
  ["cc", { family: "code", label: "C++" }],
  ["hpp", { family: "code", label: "C++ Header" }],
  ["cs", { family: "code", label: "C#" }],
  ["php", { family: "code", label: "PHP" }],
  ["swift", { family: "code", label: "Swift" }],
  ["txt", { family: "text", label: "Text" }],
])

const TOKEN_MATCHERS: Record<LanguageFamily, MatcherDefinition | null> = {
  code: {
    flags: "gm",
    patterns: [
      { tokenClassName: "token-comment", source: String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/` },
      { tokenClassName: "token-string", source: "(?:`(?:\\\\[\\s\\S]|[^`])*`|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')" },
      { tokenClassName: "token-keyword", source: String.raw`\b(?:abstract|as|async|await|break|case|catch|class|const|continue|default|delete|do|else|enum|export|extends|false|final|finally|fn|for|func|function|if|implements|import|in|instanceof|interface|let|loop|match|module|mut|new|null|package|private|protected|public|return|static|struct|super|switch|this|throw|trait|true|try|type|typeof|use|var|void|while|yield)\b` },
      { tokenClassName: "token-number", source: String.raw`\b(?:0x[a-fA-F0-9]+|\d+(?:\.\d+)?)\b` },
      { tokenClassName: "token-function", source: String.raw`\b[A-Za-z_][\w$]*(?=\()` },
    ],
  },
  data: {
    flags: "gm",
    patterns: [
      { tokenClassName: "token-comment", source: String.raw`#.*$|\/\/[^\n]*` },
      { tokenClassName: "token-property", source: String.raw`"(?:\\.|[^"\\])*"(?=\s*:)|^[ \t-]*[A-Za-z0-9_.-]+(?=\s*[:=])` },
      { tokenClassName: "token-string", source: String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'` },
      { tokenClassName: "token-keyword", source: String.raw`\b(?:true|false|null|yes|no|on|off)\b` },
      { tokenClassName: "token-number", source: String.raw`\b-?\d+(?:\.\d+)?\b` },
    ],
  },
  docker: {
    flags: "gim",
    patterns: [
      { tokenClassName: "token-comment", source: String.raw`#.*$` },
      { tokenClassName: "token-keyword", source: String.raw`^\s*(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b` },
      { tokenClassName: "token-string", source: String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'` },
      { tokenClassName: "token-function", source: String.raw`\$\{?[\w:.-]+\}?` },
    ],
  },
  markup: {
    flags: "g",
    patterns: [
      { tokenClassName: "token-comment", source: String.raw`<!--[\s\S]*?-->` },
      { tokenClassName: "token-keyword", source: String.raw`<\/?[A-Za-z][A-Za-z0-9:-]*|\/?>` },
      { tokenClassName: "token-property", source: String.raw`[A-Za-z_:][-A-Za-z0-9_:.]*(?=\=)` },
      { tokenClassName: "token-string", source: String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'` },
      { tokenClassName: "token-number", source: String.raw`&[A-Za-z0-9#]+;` },
    ],
  },
  markdown: {
    flags: "gm",
    patterns: [
      { tokenClassName: "token-keyword", source: String.raw`^#{1,6}[^\n]*|^>\s[^\n]*|(?:^|\s)(?:[-*+]|\d+\.)\s` },
      { tokenClassName: "token-function", source: "`[^`\\n]+`|```[\\s\\S]*?```" },
      { tokenClassName: "token-string", source: String.raw`\[[^\]]+\]\([^)]+\)` },
      { tokenClassName: "token-comment", source: String.raw`<!--[\s\S]*?-->` },
    ],
  },
  script: {
    flags: "gm",
    patterns: [
      { tokenClassName: "token-comment", source: String.raw`#.*$|\/\/[^\n]*|\/\*[\s\S]*?\*\/` },
      { tokenClassName: "token-string", source: "(?:`(?:\\\\[\\s\\S]|[^`])*`|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')" },
      { tokenClassName: "token-keyword", source: String.raw`\b(?:and|as|async|await|begin|break|case|class|def|do|elif|else|elsif|end|ensure|except|false|finally|for|from|if|import|in|lambda|module|next|nil|not|null|or|pass|raise|redo|require|rescue|retry|return|self|super|then|true|undef|unless|until|when|while|with|yield)\b` },
      { tokenClassName: "token-number", source: String.raw`\b(?:0x[a-fA-F0-9]+|\d+(?:\.\d+)?)\b` },
      { tokenClassName: "token-function", source: String.raw`\b[A-Za-z_][\w$]*(?=\()` },
    ],
  },
  shell: {
    flags: "gm",
    patterns: [
      { tokenClassName: "token-comment", source: String.raw`#.*$` },
      { tokenClassName: "token-function", source: String.raw`\$\{?[\w:.-]+\}?|\$\([^)]+\)` },
      { tokenClassName: "token-string", source: String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'` },
      { tokenClassName: "token-keyword", source: String.raw`\b(?:alias|case|cd|do|done|echo|elif|else|esac|exec|exit|export|fi|for|function|if|in|local|printf|read|return|set|source|test|then|trap|unset|until|while)\b` },
      { tokenClassName: "token-number", source: String.raw`\b\d+\b` },
    ],
  },
  sql: {
    flags: "gim",
    patterns: [
      { tokenClassName: "token-comment", source: String.raw`--[^\n]*|\/\*[\s\S]*?\*\/` },
      { tokenClassName: "token-string", source: String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'` },
      { tokenClassName: "token-keyword", source: String.raw`\b(?:SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CREATE|ALTER|DROP|TABLE|VALUES|INTO|AS|AND|OR|NOT|NULL|GROUP|ORDER|BY|LIMIT|OFFSET|HAVING|DISTINCT|UNION|CASE|WHEN|THEN|END)\b` },
      { tokenClassName: "token-number", source: String.raw`\b\d+(?:\.\d+)?\b` },
    ],
  },
  style: {
    flags: "gm",
    patterns: [
      { tokenClassName: "token-comment", source: String.raw`\/\*[\s\S]*?\*\/` },
      { tokenClassName: "token-keyword", source: String.raw`@[A-Za-z-]+` },
      { tokenClassName: "token-property", source: String.raw`[A-Za-z-]+(?=\s*:)` },
      { tokenClassName: "token-string", source: String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'` },
      { tokenClassName: "token-number", source: String.raw`#[a-fA-F0-9]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b` },
    ],
  },
  text: null,
}

const DEFAULT_LANGUAGE: LanguageDefinition = {
  family: "text",
  label: "Text",
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function getLanguageDefinition(filePath: string): LanguageDefinition {
  const normalizedPath = filePath.trim()
  const segments = normalizedPath.split("/")
  const fileName = segments[segments.length - 1]?.toLowerCase() ?? ""

  if (LANGUAGE_DEFINITIONS.has(fileName)) {
    return LANGUAGE_DEFINITIONS.get(fileName) ?? DEFAULT_LANGUAGE
  }

  const extension = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase() ?? ""
    : ""

  return LANGUAGE_DEFINITIONS.get(extension) ?? DEFAULT_LANGUAGE
}

function getTokenClassName(match: RegExpMatchArray, patterns: TokenPattern[]) {
  for (let index = 0; index < patterns.length; index += 1) {
    if (match[index + 1] !== undefined) {
      return patterns[index].tokenClassName
    }
  }

  return "token-plain"
}

function highlightByPattern(content: string, matcherDefinition: MatcherDefinition | null) {
  if (!matcherDefinition) {
    return escapeHtml(content)
  }

  const matcher = new RegExp(
    matcherDefinition.patterns.map((pattern) => `(${pattern.source})`).join("|"),
    matcherDefinition.flags,
  )

  let cursor = 0
  let html = ""

  for (const match of content.matchAll(matcher)) {
    const index = match.index ?? 0
    if (index > cursor) {
      html += escapeHtml(content.slice(cursor, index))
    }

    html += `<span class="${getTokenClassName(match, matcherDefinition.patterns)}">${escapeHtml(match[0])}</span>`
    cursor = index + match[0].length
  }

  if (cursor < content.length) {
    html += escapeHtml(content.slice(cursor))
  }

  return html
}

export function highlightCode(content: string, filePath: string): HighlightedCode {
  const language = getLanguageDefinition(filePath)

  return {
    html: highlightByPattern(content, TOKEN_MATCHERS[language.family]),
    languageLabel: language.label,
  }
}
