/**
 * Recursively evaluates a Mongo‐style filter object
 * against a plain lowercase text string.
 */
function evaluateFilter(filter, lowerText) {
    if (filter.$and) return filter.$and.every(f => evaluateFilter(f, lowerText));
    if (filter.$or) return filter.$or.some(f => evaluateFilter(f, lowerText));
    if (filter.$nor) return !filter.$nor.some(f => evaluateFilter(f, lowerText));

    // Leaf node: { field: { $regex: /…/ } } or { field: { $in: [ /…/, … ] } }
    const [_, cond] = Object.entries(filter)[0];
    if (cond.$regex) return cond.$regex.test(lowerText);
    if (cond.$in) return cond.$in.some(rx => rx.test(lowerText));
    return false;
}

/**
 * Checks the lowercase resume text against:
 *  • Flat‐array badges (must-all or must-any).
 *  • Three pre-built Mongo-style Boolean filters.
 */
function resumeMatches(lowerText, {
    keywordMandatoryBadges,
    keywordOptionalBadges,
    keywordBoolean,

    companyMandatoryBadges,
    companyOptionalBadges,
    companyBoolean,

    designationMandatoryBadges,
    designationOptionalBadges,
    designationBoolean,

    cities,
    regions,
    skillsKeywords
}) {
    const mustIncludeAll = arr => arr.every(kw => lowerText.includes(kw.toLowerCase()));
    const includeAny = arr => arr.some(kw => lowerText.includes(kw.toLowerCase()));

    // 1) Mandatory badges
    if (keywordMandatoryBadges && !mustIncludeAll(keywordMandatoryBadges)) return false;
    if (companyMandatoryBadges && !mustIncludeAll(companyMandatoryBadges)) return false;
    if (designationMandatoryBadges && !mustIncludeAll(designationMandatoryBadges)) return false;
    if (regions && !mustIncludeAll(regions)) return false;
    if (skillsKeywords && !mustIncludeAll(skillsKeywords)) return false;

    // 2) Optional badges / cities
    if (keywordOptionalBadges && !includeAny(keywordOptionalBadges)) return false;
    if (companyOptionalBadges && !includeAny(companyOptionalBadges)) return false;
    if (designationOptionalBadges && !includeAny(designationOptionalBadges)) return false;
    if (cities && !includeAny(cities)) return false;

    // 3) Boolean filters
    if (keywordBoolean && !evaluateFilter(keywordBoolean, lowerText)) return false;
    if (companyBoolean && !evaluateFilter(companyBoolean, lowerText)) return false;
    if (designationBoolean && !evaluateFilter(designationBoolean, lowerText)) return false;

    return true;
}

module.exports = resumeMatches