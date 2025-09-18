// extractBoolean.js
// Build MongoDB filter from a human-entered boolean string with recruiter-friendly semantics.
//
// Behavior (always on):
// - Implicit AND between adjacent factors
// - Anchor left side of first top-level AND across later top-level ORs: A AND B OR C  =>  A AND (B OR C)
// - Lift trailing top-level NOT segments to global excludes: ... NOT x NOT y => AND NOT x AND NOT y
//
// Exposed API:
//   const extractBoolean = async (inputText, fieldsToSearch, groupData, groupName) => { ... }
//   module.exports = extractBoolean;
//
// Returns:
//   { response: "ok", message: "", filter }
//   { response: "not ok", message: "why" }

const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Normalize curly quotes/dashes/nbsp + collapse whitespace
function normalizeQuotesSpaces(s = "") {
  return String(s)
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
}

// Mongo-safe phrase/word boundary without lookbehind: not glued to [A-Za-z0-9_]
function makePhraseRegex(phrase) {
  const p = (phrase || "").trim();
  if (!p) return null;
  const escaped = escapeRegex(p);
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, "i");
}

function containsBooleanOps(s) {
  return /\b(?:and|or|not)\b|&&|\|\||!|-/.test(s.toLowerCase());
}

function findMatchingParen(str, i) {
  let depth = 0;
  for (let k = i; k < str.length; k++) {
    if (str[k] === "(") depth++;
    else if (str[k] === ")") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
}

// ---------------- Tokenizer ----------------
/**
 * Tokens:
 * - {type:"term", value:string}
 * - {type:"op", value:"and"|"or"|"not"}
 * - {type:"paren", value:"(" | ")"}
 */
function tokenizeBoolean(input) {
  const s = input;
  const tokens = [];
  let i = 0;

  const isSpace = (c) => /\s/.test(c);
  const isQuote = (c) => c === "'" || c === '"' || c === "`";

  while (i < s.length) {
    const ch = s[i];

    if (isSpace(ch)) { i++; continue; }

    if (ch === "(") {
      const j = findMatchingParen(s, i);
      if (j === -1) throw new Error("Unbalanced parentheses: missing ')'.");
      const inner = s.slice(i + 1, j).trim();

      // If no boolean ops or parens inside, treat parentheses as a phrase token
      if (!containsBooleanOps(inner) && !/[()]/.test(inner)) {
        if (inner.length) tokens.push({ type: "term", value: inner.toLowerCase() });
        i = j + 1;
        continue;
      } else {
        tokens.push({ type: "paren", value: "(" });
        i++;
        continue;
      }
    }

    if (ch === ")") { tokens.push({ type: "paren", value: ")" }); i++; continue; }

    if (isQuote(ch)) {
      const q = ch; i++;
      let buf = "", closed = false;
      while (i < s.length) {
        if (s[i] === q) { closed = true; i++; break; }
        buf += s[i++];
      }
      if (!closed) throw new Error("Unbalanced quotes: missing closing quote.");
      tokens.push({ type: "term", value: buf.trim().toLowerCase() });
      continue;
    }

    // Bare word / operator
    let buf = "";
    while (i < s.length && !isSpace(s[i]) && s[i] !== "(" && s[i] !== ")") {
      buf += s[i++];
    }
    const word = buf.trim().toLowerCase();
    if (!word) continue;

    if (word === "and" || word === "&&") tokens.push({ type: "op", value: "and" });
    else if (word === "or" || word === "||") tokens.push({ type: "op", value: "or" });
    else if (word === "not" || word === "!" || word === "-") tokens.push({ type: "op", value: "not" });
    else tokens.push({ type: "term", value: word });
  }

  return tokens;
}

// ------------- Implicit AND insertion -------------
// e.g. "javascript not java" -> "javascript AND not java"
//      "java 'spring boot'"  -> "java AND 'spring boot'"
//      ") ("                 -> ") AND ("
function insertImplicitAnd(tokens) {
  const out = [];
  const isTermOrClose = (t) => t && (t.type === "term" || (t.type === "paren" && t.value === ")"));
  const isStartOfFactor = (t) =>
    t && (t.type === "term" || (t.type === "paren" && t.value === "(") || (t.type === "op" && t.value === "not"));

  for (let i = 0; i < tokens.length; i++) {
    const prev = out[out.length - 1];
    const curr = tokens[i];
    if (isTermOrClose(prev) && isStartOfFactor(curr)) {
      out.push({ type: "op", value: "and" });
    }
    out.push(curr);
  }
  return out;
}

// ------------- Parser (Shunting-Yard) -------------
const PRECEDENCE = { not: 3, and: 2, or: 1 };
const RIGHT_ASSOC = { not: true };

function toRPN(tokens) {
  const out = [];
  const stack = [];

  for (const t of tokens) {
    if (t.type === "term") {
      out.push(t);
    } else if (t.type === "op") {
      const o1 = t.value;
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.type === "op") {
          const o2 = top.value;
          const cond = RIGHT_ASSOC[o1]
            ? PRECEDENCE[o1] < PRECEDENCE[o2]
            : PRECEDENCE[o1] <= PRECEDENCE[o2];
          if (cond) { out.push(stack.pop()); continue; }
        }
        break;
      }
      stack.push(t);
    } else if (t.type === "paren" && t.value === "(") {
      stack.push(t);
    } else if (t.type === "paren" && t.value === ")") {
      while (stack.length && !(stack[stack.length - 1].type === "paren" && stack[stack.length - 1].value === "(")) {
        out.push(stack.pop());
      }
      if (!stack.length) throw new Error("Unbalanced parentheses: missing '('.");
      stack.pop();
    }
  }

  while (stack.length) {
    const x = stack.pop();
    if (x.type === "paren") throw new Error("Unbalanced parentheses.");
    out.push(x);
  }
  return out;
}

function rpnToAst(rpn) {
  const st = [];
  for (const t of rpn) {
    if (t.type === "term") {
      st.push({ kind: "term", value: t.value });
    } else if (t.type === "op") {
      if (t.value === "not") {
        const a = st.pop();
        if (!a) throw new Error("NOT is missing an operand.");
        st.push({ kind: "not", child: a });
      } else {
        const b = st.pop(), a = st.pop();
        if (!a || !b) throw new Error(`${t.value.toUpperCase()} is missing operand(s).`);
        st.push({ kind: t.value, left: a, right: b });
      }
    }
  }
  if (st.length !== 1) throw new Error("Malformed boolean expression.");
  return st[0];
}

// --------- AST -> Mongo Filter ----------
function buildTermCondition(phrase, fieldsToSearch, data, groupName) {
  const rx = makePhraseRegex(phrase);
  if (!rx) return {};

  // company / designation special handling for current/previous on experiences
  if ((groupName === "company" || groupName === "designation") && Array.isArray(fieldsToSearch) && fieldsToSearch.length === 1) {
    const dotted = fieldsToSearch[0]; // "experiences.employer" or "experiences.jobTitle"
    const wantCurrent = data?.searchCurrent === true;
    const wantPrevious = data?.searchPrevious === true;

    if (!wantCurrent && !wantPrevious) {
      return { [dotted]: { $regex: rx } };
    }

    const roleField = dotted.split(".")[1] || "employer";
    const base = { [roleField]: { $regex: rx } };
    const buckets = [];
    if (wantCurrent) buckets.push({ experiences: { $elemMatch: { ...base, isCurrentExperience: true } } });
    if (wantPrevious) buckets.push({ experiences: { $elemMatch: { ...base, isCurrentExperience: false } } });
    return buckets.length === 1 ? buckets[0] : { $or: buckets };
  }

  // generic: OR across fields
  const perField = (fieldsToSearch || []).map((f) => ({ [f]: { $regex: rx } }));
  if (perField.length === 0) return {};
  if (perField.length === 1) return perField[0];
  return { $or: perField };
}

function negate(cond) { return { $nor: [cond] }; }

function astToMongo(node, fieldsToSearch, data, groupName) {
  switch (node.kind) {
    case "term":
      return buildTermCondition(node.value, fieldsToSearch, data, groupName);
    case "not": {
      const inner = astToMongo(node.child, fieldsToSearch, data, groupName);
      return negate(inner);
    }
    case "and": {
      const l = astToMongo(node.left, fieldsToSearch, data, groupName);
      const r = astToMongo(node.right, fieldsToSearch, data, groupName);
      const parts = [];
      const push = (x) => { if (x && typeof x === "object" && x.$and) parts.push(...x.$and); else parts.push(x); };
      push(l); push(r);
      return { $and: parts };
    }
    case "or": {
      const l = astToMongo(node.left, fieldsToSearch, data, groupName);
      const r = astToMongo(node.right, fieldsToSearch, data, groupName);
      const parts = [];
      const push = (x) => { if (x && typeof x === "object" && x.$or) parts.push(...x.$or); else parts.push(x); };
      push(l); push(r);
      return { $or: parts };
    }
    default:
      return {};
  }
}

// --------- Recruiter semantics helpers (always-on) ----------

// Split tokens by top-level ANDs into segments
function splitByTopLevelAnd(tokens) {
  const segs = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "paren") depth += t.value === "(" ? 1 : -1;
    else if (t.type === "op" && t.value === "and" && depth === 0) {
      segs.push(tokens.slice(start, i));
      start = i + 1;
    }
  }
  segs.push(tokens.slice(start));
  return segs.filter(s => s.length > 0);
}

// Determine if a segment is exactly a NOT-factor (e.g., NOT X)
function isPureNotSegment(seg) {
  try {
    const rpn = toRPN(seg);
    const ast = rpnToAst(rpn);
    return ast && ast.kind === "not";
  } catch {
    return false;
  }
}

// Find anchor = tokens before the first top-level AND, if any top-level OR exists after it
function findAnchorTokens(tokens) {
  let depth = 0;
  let firstTopAnd = -1;
  let hasTopOrAfter = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "paren") depth += t.value === "(" ? 1 : -1;
    else if (t.type === "op" && depth === 0) {
      if (t.value === "and" && firstTopAnd === -1) firstTopAnd = i;
      if (t.value === "or" && firstTopAnd !== -1) { hasTopOrAfter = true; break; }
    }
  }
  if (firstTopAnd > 0 && hasTopOrAfter) {
    return tokens.slice(0, firstTopAnd);
  }
  return null;
}

// ---------------- Public API ----------------
/**
 * @param {string} inputText - human-entered boolean formula
 * @param {string[]} fieldsToSearch - dotted field paths
 * @param {object} groupData - may contain:
 *    exclude:boolean, excludeBadges:string[], searchCurrent:boolean, searchPrevious:boolean
 * @param {"keyword"|"company"|"designation"} groupName
 * @returns {Promise<{response:"ok"|"not ok", message:string, filter?:object}>}
 */
const extractBoolean = async (inputText, fieldsToSearch, groupData = {}, groupName = "keyword") => {
  try {
    const raw = normalizeQuotesSpaces(inputText || "");
    const normalized = raw.toLowerCase();

    // Empty -> only exclusions (if any)
    if (!normalized) {
      const ex = groupData.exclude ? buildExclusions(groupData.excludeBadges, fieldsToSearch, groupData, groupName) : null;
      const filter = ex ? (ex.$and ? { $and: ex.$and } : ex) : {};
      return { response: "ok", message: "", filter };
    }

    // Tokenize + implicit ANDs
    const t0 = tokenizeBoolean(normalized);
    const tokens = insertImplicitAnd(t0);
    if (tokens.length === 0) return { response: "ok", message: "", filter: {} };

    // --- Lift trailing top-level NOT segments to global excludes ---
    const segments = splitByTopLevelAnd(tokens);
    const globalNotSegments = [];
    while (segments.length) {
      const last = segments[segments.length - 1];
      if (isPureNotSegment(last)) { globalNotSegments.push(segments.pop()); }
      else break;
    }
    // Re-join remaining segments with top-level ANDs into mainTokens
    const mainTokens = [];
    segments.forEach((seg, idx) => {
      if (idx > 0) mainTokens.push({ type: "op", value: "and" });
      mainTokens.push(...seg);
    });

    // --- Anchor left of first top-level AND across later top-level ORs ---
    let anchorFilter = null;
    const anchorTokens = findAnchorTokens(mainTokens);
    if (anchorTokens && anchorTokens.length) {
      const rpnA = toRPN(anchorTokens);
      const astA = rpnToAst(rpnA);
      anchorFilter = astToMongo(astA, fieldsToSearch, groupData, groupName);
    }

    // Parse main expression
    const rpn = toRPN(mainTokens);
    const ast = rpnToAst(rpn);
    let core = astToMongo(ast, fieldsToSearch, groupData, groupName);

    // Apply anchor (AND with whole expression)
    if (anchorFilter) {
      core = core.$and ? { $and: [...core.$and, anchorFilter] } : { $and: [core, anchorFilter] };
    }

    // Apply lifted global NOTs
    if (globalNotSegments.length) {
      const notFilters = globalNotSegments.map(seg => {
        const rpnN = toRPN(seg);
        const astN = rpnToAst(rpnN);
        return astToMongo(astN, fieldsToSearch, groupData, groupName);
      });
      core = core.$and ? { $and: [...core.$and, ...notFilters] } : { $and: [core, ...notFilters] };
    }

    // Apply explicit global excludes from groupData
    const ex = groupData.exclude ? buildExclusions(groupData.excludeBadges, fieldsToSearch, groupData, groupName) : null;

    let filter = core;
    if (ex) {
      filter = filter.$and ? { $and: [...filter.$and, ex] } : { $and: [filter, ex] };
    }

    return { response: "ok", message: "", filter };
  } catch (err) {
    return { response: "not ok", message: err?.message || "Failed to parse boolean formula." };
  }
};

// Build exclusions from excludeBadges (global, ANDed at top level)
function buildExclusions(excludeBadges, fieldsToSearch, data, groupName) {
  if (!Array.isArray(excludeBadges) || excludeBadges.length === 0) return null;
  const pieces = excludeBadges
    .map((b) => (b == null ? "" : String(b)).trim())
    .filter(Boolean)
    .map((b) => negate(buildTermCondition(b, fieldsToSearch, data, groupName)));
  if (!pieces.length) return null;
  return pieces.length === 1 ? pieces[0] : { $and: pieces };
}

module.exports = extractBoolean;
