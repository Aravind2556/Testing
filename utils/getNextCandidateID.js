const Candidate = require('../models/Candidate')

async function getNextCandidateID() {
    const last = await Candidate.findOne({ candidateID: /^sanc\d{7}$/ })
        .sort({ candidateID: -1 })
        .lean();

    let nextNum = 1;
    if (last && last.candidateID) {
        const numPart = parseInt(last.candidateID.replace('sanc', ''), 10);
        if (!isNaN(numPart)) {
            nextNum = numPart + 1;
        }
    }

    return 'sanc' + String(nextNum).padStart(7, '0');
}


module.exports = getNextCandidateID