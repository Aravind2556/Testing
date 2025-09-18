const excludeBadges = require('./ExcludeBadges')

const extractBoolean = (inputText, fieldsToSearch, groupData, groupName) => {
    try {
        if (typeof inputText !== 'string' || inputText.trim().length === 0) {
            throw new Error('inputText must be a non-empty string.');
        }

        //
        // ─── UTILITY FUNCTIONS ──────────────────────────────────────────────────────
        //

        // Strip matching quotes/backticks from ends; if no matching, return original.
        const stripQuotes = (s) => {
            if (s.length >= 2) {
                const first = s[0], last = s[s.length - 1];
                if ((first === '"' && last === '"') ||
                    (first === "'" && last === "'") ||
                    (first === '`' && last === '`')) {
                    return s.slice(1, -1);
                }
            }
            return s;
        };

        // Normalize a raw token: lowercase it. If it's an operator ("and"/"or"/"not"), return that. Otherwise, return keyword string.
        const normalizeToken = (raw) => {
            const lower = raw.toLowerCase();
            if (lower === 'and' || lower === 'or' || lower === 'not') {
                return lower;
            }
            return lower; // keyword (including quotes), already lowercased
        };

        /**
         * Recursively parse inputText (from index i) into a nested array of tokens.
         * Returns [parsedArray, nextIndex].
         */
        const parseSequence = (i) => {
            const items = [];
            let buffer = '';
            let inQuote = false;
            let quoteChar = null;

            while (i < inputText.length) {
                const c = inputText[i];

                // 1) Quote toggling
                if ((c === '"' || c === "'" || c === '`') && !inQuote) {
                    inQuote = true;
                    quoteChar = c;
                    buffer += c;
                    i++;
                    continue;
                } else if (c === quoteChar && inQuote) {
                    inQuote = false;
                    buffer += c;
                    i++;
                    continue;
                }

                // 2) Parenthesis handling (only if not inside a quote)
                if (!inQuote && c === '(') {
                    // Flush buffer as token (if any) before diving in
                    const trimmed = buffer.trim();
                    if (trimmed) {
                        items.push(normalizeToken(trimmed));
                    }
                    buffer = '';
                    // Recurse for the subgroup
                    const [subItems, nextIndex] = parseSequence(i + 1);
                    items.push(subItems);
                    i = nextIndex + 1; // skip past ')'
                    continue;
                }

                if (!inQuote && c === ')') {
                    // End of this subgroup
                    const trimmed = buffer.trim();
                    if (trimmed) {
                        items.push(normalizeToken(trimmed));
                    }
                    buffer = '';
                    return [items, i];
                }

                // 3) Whitespace outside quotes/parentheses = token boundary
                if (!inQuote && /\s/.test(c)) {
                    const trimmed = buffer.trim();
                    if (trimmed) {
                        items.push(normalizeToken(trimmed));
                    }
                    buffer = '';
                    i++;
                    continue;
                }

                // 4) Default: accumulate character
                buffer += c;
                i++;
            }

            // End of string: flush leftover
            const leftover = buffer.trim();
            if (leftover) {
                items.push(normalizeToken(leftover));
            }
            return [items, i];
        };

        // Kick off parsing
        const [parsedTree, finalIdx] = parseSequence(0);
        // If finalIdx < inputText.length, that means an unmatched ")"
        if (finalIdx < inputText.length) {
            throw new Error('Unmatched parenthesis.');
        }

        //
        // ─── BUILD MONGODB FILTER ────────────────────────────────────────────────────
        //

        /**
         * Given a single keyword string (already normalized/lowercased, still quoted if multi-word),
         * return a filter that matches any of fieldsToSearch containing exactly that keyword.
         * e.g. { $or: [ {field1: {$in: [keywordValue]} }, {field2: {$in: [keywordValue]}} ] }
         */
        const singleKeywordFilter = (keywordToken) => {
            // Strip quotes/backticks, but preserve case of inner content (original input might have mixed case)
            const rawValue = stripQuotes(keywordToken);
            if (rawValue.trim() === '') {
                throw new Error('Empty keyword.');
            }
            // Build an $or across all fieldsToSearch
            return {
                $or: fieldsToSearch.map((field) => ({
                    [field]: { $in: [rawValue] }
                }))
            };
        };

        /**
         * Given an array node (parsedTree or subgroup), build a MongoDB filter.
         * That array has the form: [ operand0, op0, operand1, op1, operand2, ... ]
         * where operands are either strings (keywords) or nested arrays (groups),
         * and ops are "and", "or", or "not".
         *
         * This function first checks for simple optimization cases:
         *  1) All operators are "or" and all operands are keywords (strings):
         *     → Build a single $or filter with $in: [ all keywordValues ], across all fields.
         *  2) All operators are "and" and all operands are keywords:
         *     → Build an $and of singleKeywordFilter(...) for each keyword.
         *
         * Otherwise, it does a left-to-right combination:
         *   current = buildFilter(operand0)
         *   for each j in [0..ops.length-1]:
         *     op = ops[j], nextF = buildFilter(operand_{j+1})
         *     if op=="and": current = { $and: [current, nextF] }
         *     if op=="or":  current = { $or:  [current, nextF] }
         *     if op=="not": // treat as "AND NOT"
         *       const neg = { $nor: [ nextF ] }
         *       current = { $and: [ current, neg ] }
         */
        const buildFilterFromArray = (arrNode) => {
            // Validate structure length
            if (!Array.isArray(arrNode) || arrNode.length === 0) {
                throw new Error('Invalid group array.');
            }
            // Must be in form [operand, op, operand, op, operand, ...]
            if (arrNode.length % 2 === 0) {
                throw new Error('Each group must have odd number of elements: operand, operator, operand, ...');
            }

            // Partition operands and operators
            const operands = [];
            const operators = [];
            for (let i = 0; i < arrNode.length; i++) {
                if (i % 2 === 0) {
                    operands.push(arrNode[i]);
                } else {
                    const op = arrNode[i];
                    if (typeof op !== 'string' || !['and', 'or', 'not'].includes(op)) {
                        throw new Error(`Invalid operator '${op}'.`);
                    }
                    operators.push(op);
                }
            }

            // Check for optimization: all ops === "or", all operands are strings
            const allOr = operators.every((o) => o === 'or');
            const allAnd = operators.every((o) => o === 'and');
            const allOperandsAreStrings = operands.every((x) => typeof x === 'string');

            if (allOr && allOperandsAreStrings) {
                // Collect all keyword values (strip quotes)
                const values = operands.map((kw) => stripQuotes(kw));
                // Build a single $or across fields with $in: values
                return {
                    $or: fieldsToSearch.map((field) => ({
                        [field]: { $in: values }
                    }))
                };
            }

            if (allAnd && allOperandsAreStrings) {
                // Build an $and of single-keyword filters
                const subfilters = operands.map((kw) => singleKeywordFilter(kw));
                return { $and: subfilters };
            }

            // Fallback: left-to-right combination
            const builtOperands = operands.map((opd) => {
                if (typeof opd === 'string') {
                    // string keyword
                    return singleKeywordFilter(opd);
                } else if (Array.isArray(opd)) {
                    // nested group
                    return buildFilterFromArray(opd);
                } else {
                    throw new Error('Operand must be string or array.');
                }
            });

            // Combine in sequence
            let current = builtOperands[0];
            for (let j = 0; j < operators.length; j++) {
                const op = operators[j];
                const nextF = builtOperands[j + 1];

                if (op === 'and') {
                    current = { $and: [current, nextF] };
                } else if (op === 'or') {
                    current = { $or: [current, nextF] };
                } else if (op === 'not') {
                    // NOT is treated as AND NOT nextF
                    const neg = { $nor: [nextF] };
                    current = { $and: [current, neg] };
                } else {
                    // Should never reach here because we validated ops above
                    throw new Error(`Unexpected operator '${op}'.`);
                }
            }
            return current;
        };

        /**
         * Entry point to build the final filter from parsedTree.
         * parsedTree might be a single keyword string, or an array. We only expect an array at top-level,
         * but handle string case anyway.
         */
        const buildFilter = (node) => {
            if (typeof node === 'string') {
                // If someone passed a lone operator at top‐level, it's invalid
                if (['and', 'or', 'not'].includes(node)) {
                    throw new Error(`Lone operator '${node}' without operand.`);
                }
                return singleKeywordFilter(node);
            } else if (Array.isArray(node)) {
                return buildFilterFromArray(node);
            } else {
                throw new Error('Parsed node must be string or array.');
            }
        };

        // Build the filter. If any error is thrown, we catch below and return false.
        let finalFilter = buildFilter(parsedTree);

        const validateExcludingFilter = excludeBadges(groupName, groupData, fieldsToSearch)

        if(validateExcludingFilter?.success){
            finalFilter.push({$not: validateExcludingFilter.excludingFilter})
        }

        return finalFilter;
    } catch (err) {
        // On any failure, return false
        return false;
    }
}


module.exports = extractBoolean