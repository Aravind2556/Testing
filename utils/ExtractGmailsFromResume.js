function extractGmailsFromResume(text) {
  if (typeof text !== 'string') {
    throw new TypeError('extractGmailsFromResume: input must be a string');
  }

  const results = new Set();
  const domain = '@gmail.com';
  const domainLen = domain.length;

  // Helper: is valid character in local-part
  function isValidLocalChar(ch) {
    return /[a-z0-9.+_-]/i.test(ch);
  }

  // Iterate through all '@gmail.com' occurrences
  let idx = text.toLowerCase().indexOf(domain);
  while (idx !== -1) {
    // Walk backwards to capture local-part
    let start = idx - 1;
    while (start >= 0 && isValidLocalChar(text[start])) {
      start--;
    }
    // local-part is between (start+1) and idx
    const local = text.slice(start + 1, idx);
    // Advance idx for next search
    idx = text.toLowerCase().indexOf(domain, idx + domainLen);

    // Validate local-part
    if (!local) continue;  // nothing before the '@'
    if (/^\.|\.$/.test(local)) continue;        // leading/trailing dot
    if (/\.\./.test(local)) continue;          // consecutive dots
    if (local.length > 64) continue;             // too long
    if (!/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?$/i.test(local)) continue; // invalid chars or boundaries

    // Form full email and add
    const email = local.toLowerCase() + domain;
    results.add(email);
  }

  return Array.from(results);
}

// Export for CommonJS (Node.js)
module.exports = extractGmailsFromResume;