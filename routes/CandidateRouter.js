const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const Candidate = require('../models/Candidate');
const userModel = require('../models/User')
const { hashPassword } = require('../utils/Bcrypt')
const getNextCandidateID = require('../utils/getNextCandidateID');
const isAuth = require('../middleware/isAuth');
const router = express.Router();

// Multer setup
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(xls|xlsx)$/)) {
            return cb(new Error('Only Excel files are allowed!'), false);
        }
        cb(null, true);
    }
});

// helper to create an 8‑char password with 1 special, 1 lower, 1 upper, 1 digit
const generatePassword = async () => {
    const specials = '!@#$%^&*()_+[]';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const all = specials + lower + upper + digits;
    // pick one of each
    let pw = [
        specials[Math.floor(Math.random() * specials.length)],
        lower[Math.floor(Math.random() * lower.length)],
        upper[Math.floor(Math.random() * upper.length)],
        digits[Math.floor(Math.random() * digits.length)]
    ].join('');
    // fill to 8 chars
    while (pw.length < 8) {
        pw += all[Math.floor(Math.random() * all.length)];
    }
    // shuffle
    const generatedPassword = pw.split('').sort(() => 0.5 - Math.random()).join('');
    const hashedPassword = await hashPassword(generatedPassword)
    return hashedPassword
};

// Helper functions
const stripNonDigits = str => (str || '').toString().replace(/\D+/g, '');
const parsePhone = raw => {
    let digits = stripNonDigits(raw).replace(/^0+/, '');
    if (digits.length <= 10) return { countryCode: 91, mobileNumber: digits };
    const CODES = ['234', '971', '968', '965', '977', '852', '963', '356', '212', '81', '91', '44', '49', '61', '66', '34', '60', '62', '86', '48', '57', '7', '9', '1'];
    for (let code of CODES) {
        if (digits.startsWith(code)) {
            return { countryCode: Number(code), mobileNumber: digits.slice(code.length) };
        }
    }
    const number = digits.slice(-10);
    const cc = digits.slice(0, -10) || '91';
    return { countryCode: Number(cc), mobileNumber: number };
};
const parseMulti = raw => (raw || '').toString().split(',').map(s => s.trim()).filter(Boolean);
const parseBool = raw => {
    if (!raw) return undefined;
    const v = raw.toString().toLowerCase();
    if (v.includes('yes')) return true;
    if (v.includes('no')) return false;
    return undefined;
};
const parseGender = raw => {
    const v = (raw || '').toString().toLowerCase();
    if (['male', 'female', 'other'].includes(v)) return v;
    return undefined;
};

// Helper for parsing dates in dd/mm/yyyy or other formats
const parseDate = raw => {
    if (!raw) return undefined;

    // If already a valid JS Date object
    if (raw instanceof Date && !isNaN(raw)) return raw;

    // Excel serial number (e.g. 34701)
    if (!isNaN(raw) && typeof raw !== 'string') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30
        const date = new Date(excelEpoch.getTime() + raw * 86400000);
        return isNaN(date) ? undefined : date;
    }

    const s = String(raw).trim();

    // dd/mm/yyyy
    const dmY = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
    if (dmY.test(s)) {
        const [day, month, year] = s.split('/');
        const d = new Date(+year, +month - 1, +day);
        return isNaN(d) ? undefined : d;
    }

    // Fallback to native Date
    const d = new Date(s);
    return isNaN(d) ? undefined : d;
};


const parseExperience = raw => {
    if (raw == null) return {};
    const s = raw.toString().trim();
    // if contains a dot, interpret digits after dot as months
    if (s.includes('.')) {
        const [yPart, mPart] = s.split('.');
        let year = parseInt(yPart, 10) || 0;
        let month = parseInt(mPart, 10) || 0;
        // roll over every 12 months into a year
        if (month >= 12) {
            year += Math.floor(month / 12);
            month = month % 12;
        }
        return { year, month };
    }
    // no dot → whole years
    const year = parseInt(s, 10) || 0;
    return { year, month: 0 };
};
const parseCTC = raw => {
    if (!raw) return {};
    let s = raw.toString().toLowerCase().trim().replace(/\.\./g, '.');
    if (s.includes('-')) {
        const parts = s.split('-').map(p => p.replace(/[^\d.]/g, ''));
        s = parts.sort((a, b) => parseFloat(b) - parseFloat(a))[0];
    }
    const currencyMatch = s.match(/^(usd|cad|qar|afn|bnd|isk|xof|eur|aed|inr|all)\//);
    let currency = 'inr';
    if (currencyMatch) {
        currency = currencyMatch[1];
        s = s.slice(currencyMatch[0].length);
    }
    s = s.replace(/[^\d.]/g, '');
    let num = parseFloat(s);
    if (isNaN(num)) return {};
    const rates = { cad: 61.07, usd: 84.41, qar: 23.13, afn: 1.19, bnd: 65.04, isk: 0.65, xof: 0.15, eur: 95.53, aed: 22.98 };
    if (rates[currency]) num *= rates[currency];
    if (num > 100000) num = num / 100000;
    return { currency, amount: Math.round(num * 100) / 100 };
};

const parseNotice = raw => {
    if (!raw) return undefined;
    const v = raw.toString().toLowerCase();
    if (v.includes('immediate') || v.includes('any')) return 'immediate joiner';
    if (v.includes('current')) return 'currently serving notice period';
    const n = parseInt(v, 10);
    if ([7, 15, 30, 45, 60, 90].includes(n)) return `${n} days`;
    if (v.includes('month')) return '30 days';
    return undefined;
};

// SSE endpoint for progress
router.get('/import-candidate-sse', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
    });
    res.flushHeaders();
    res.socket.setTimeout(0);
    global.importSSE = res;
    req.on('close', () => { global.importSSE = null; });
});


// POST import endpoint with upsert and zipCode guard
router.post('/import-candidate', upload.single('file'), async (req, res) => {
    try {
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
        const total = rows.length;
        let saved = 0;
        let duplicates = [];

        const existingEmails = new Set(await Candidate.distinct('emailAddress'));

        for (let [i, row] of rows.entries()) {

            const doc = {};
            if (row['Applicant ID']) doc.applicantID = Number(row['Applicant ID']);

            if (row['Applicant Name']) doc.applicantName = row['Applicant Name'].trim();
            if (row['Email Address']) doc.emailAddress = row['Email Address'].trim().toLowerCase();

            // auto‑generate a password if not present
            doc.password = await generatePassword();

            if (row['Mobile Number']) {
                const p = parsePhone(row['Mobile Number']);
                doc.phoneNumber = { countryCode: p.countryCode, number: p.mobileNumber };
            }
            if (row['Job Title']) doc.preferredJob = parseMulti(row['Job Title']);

            // Address object
            doc.presentAddress = {};
            if (row['City']) doc.presentAddress.city = row['City'];
            if (row['State']) doc.presentAddress.state = row['State'];
            if (row['Country']) doc.presentAddress.country = row['Country'];
            if (row['Address']) doc.presentAddress.addressLine1 = row['Address'];
            // Guard against NaN zipCode
            const zip = parseInt(row['Zip Code'], 10);
            if (!isNaN(zip)) doc.presentAddress.zipCode = zip;

            if (row['Source']) doc.source = row['Source'];
            if (row['Applicant Status']) doc.applicantStatus = row['Applicant Status'];
            doc.experience = parseExperience(row['Experience']);

            const expCTC = parseCTC(row['Expected Pay']);
            if (expCTC.amount) doc.expectedCTC = expCTC;

            const g = parseGender(row['Gender']);
            if (g) doc.gender = g;

            if (row['Disability']) {
                const d = parseBool(row['Disability']);
                if (d != null) doc.disability = { isDisabled: d };
            }
            if (row['Created By']) doc.createdBy = row['Created By'];
            if (row['Created On']) {
                const d = parseDate(row['Created On']);
                if (d) doc.createdOn = d;
            }
            if (row['Last Name']) doc.lastName = row['Last Name'];
            if (row['Ownership']) doc.ownership = row['Ownership'];
            if (row['Updated On']) {
                const d = parseDate(row['Updated On']);
                if (d) doc.updatedOn = d;
            }
            if (row['Skills']) doc.skills = parseMulti(row['Skills']);

            if (doc.skills && doc.skills.length > 0) {
                const docSkill = doc.skills
                let consolidatedSkills = docSkill.map(skill => {
                    let tempSkills = {
                        skill: skill,
                    }

                    if (doc.experience && doc.experience.year && doc.experience.month) {
                        tempSkills.experience = doc.experience
                    }
                    return tempSkills
                })

                doc.skills = consolidatedSkills
            }

            const curCTC = parseCTC(row['Current CTC']);
            if (curCTC.amount) doc.currentCTC = curCTC;

            // only add experience object if at least one field is present
            const exp = {};

            const emp = row['Current Employer'];
            if (emp && emp.toString().trim().toLowerCase() !== 'undefined') {
                exp.employer = emp;
            }


            if (row['Job Title']) exp.jobTitle = row['Job Title'];
            // always mark as ongoing if we have an entry
            if (Object.keys(exp).length) {
                exp.isOngoing = true;
                doc.experiences = [exp];
            }

            if (row['Home Phone Number']) {
                const h = parsePhone(row['Home Phone Number']);
                doc.alternatePhoneNumber = { countryCode: h.countryCode, number: h.mobileNumber };
            }
            if (row['Alternate Email Address']) doc.alternateEmailAddress = row['Alternate Email Address'];
            if (row['Applicant Full Name']) doc.applicantFullName = row['Applicant Full Name'];

            if (row['Date Of Birth']) {
                const d = parseDate(row['Date Of Birth'])
                if (d) doc.dateOfBirth = d;
            }
            if (row['First Name']) doc.firstName = row['First Name'];
            if (row['Preferred Location']) doc.preferredLocation = parseMulti(row['Preferred Location']);
            if (row['Primary Skills']) doc.primarySkills = parseMulti(row['Primary Skills']);

            if (doc.primarySkills && doc.primarySkills.length > 0) {
                const docSkill = doc.primarySkills
                let consolidatedSkills = docSkill.map(skill => {
                    let tempSkills = {
                        primarySkill: skill,
                    }

                    if (doc.experience && doc.experience.year && doc.experience.month) {
                        tempSkills.experience = doc.experience
                    }
                    return tempSkills
                })

                doc.primarySkills = consolidatedSkills
            }

            if (row['Recent Note On']) {
                const d = parseDate(row['Recent Note On']);
                if (d) doc.recentNoteOn = d;
            }
            if (row['Relocation']) {
                const r = parseBool(row['Relocation']); if (r != null) doc.relocation = r;
            }
            if (row['Notice Period']) doc.noticePeriod = parseNotice(row['Notice Period']);
            if (row['Resume Available']) {
                const ra = parseBool(row['Resume Available']); if (ra != null) doc.resumeAvailable = ra;
            }
            // if (doc.applicantID && doc.resumeAvailable) {
            //     doc.resumeLink = `/uploads/resumes/resume${doc.applicantID}.pdf`
            // }
            if (row['Created date']) {
                const d = parseDate(row['Created date']); if (d) doc.createdDate = d;
            }
            if (row['Notice Period Serving Date']) {
                const d = parseDate(row['Notice Period Serving Date'])
                if (d) {
                    doc.noticePeriodServingDate = d;
                }
            }
            if (row['Updated By']) doc.updatedBy = row['Updated By'];
            if (row['Profile Sourced']) doc.profileSourced = row['Profile Sourced'];

            // if (row['Date']) {
            //     const d = parseDate(row['Date']);
            //     if (d) doc.date = d;
            // }
            if (row['Negotiable Notice Period']) {
                doc.negotiableNoticePeriod = parseNotice(row['Negotiable Notice Period']);
            }

            // Clean out empty fields (but preserve Dates)
            Object.keys(doc).forEach(k => {
                const v = doc[k];
                if (v == null
                    || (typeof v === 'string' && !v.trim())
                    || (Array.isArray(v) && v.length === 0)
                    || (typeof v === 'object'
                        && !(v instanceof Date)
                        && !Array.isArray(v)
                        && Object.keys(v).length === 0)
                ) {
                    delete doc[k];
                }
            });

            if (!doc.emailAddress) { duplicates.push({ applicantID: doc.applicantID, email: null }); continue; }


            const existingCandidate = await Candidate.findOne({
                $or: [
                    { applicantID: doc.applicantID },
                    { emailAddress: doc.emailAddress }
                ]
            });

            if (existingCandidate) {
                duplicates.push({
                    candidateID: existingCandidate.candidateID,
                    applicantID: existingCandidate.applicantID,
                    email: existingCandidate.emailAddress
                });

                if (global.importSSE) {
                    global.importSSE.write(`data: ${JSON.stringify({
                        processed: i + 1,
                        total,
                        saved,
                        skipped: doc.applicantID || doc.emailAddress,
                        reason: 'duplicate email or applicantID'
                    })}\n\n`);
                }

                continue;
            }

            doc.candidateID = await getNextCandidateID();
            const newCandidate = new Candidate(doc);
            await newCandidate.save();
            saved++;
            if (global.importSSE) {
                global.importSSE.write(`data: ${JSON.stringify({ processed: i + 1, total, saved })}\n\n`);
            }
        }

        if (duplicates.length) {
            console.log("🚨 Duplicate candidates based on applicantID or emailAddress:\n");
            duplicates.forEach(d => {
                console.log(`CandidateID: ${d.candidateID}, ApplicantID: ${d.applicantID}, Email: ${d.email}`);
            });
        }


        // Done event
        if (global.importSSE) {
            global.importSSE.write(`event: done\ndata: ${JSON.stringify({ saved, total, duplicates })}\n\n`);
            global.importSSE.end();      // ← finish the chunked SSE response
            global.importSSE = null;
        }

        res.status(200).json({ message: 'Import started', total });
    } catch (err) {
        console.log("Error in importing candidate:", err)
        if (global.importSSE) {
            global.importSSE.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
        }
        res.status(500).json({ error: err.message });
    }
});

router.get('/fetch-candidates', async (req, res) => {
    try {
        const candidates = await Candidate.find({}, '-password');
        if (!candidates) {
            return res.status(404).json({ success: false, message: 'Candidates not found' });
        }
        res.send({ success: true, message: 'Succesfully fetched the Candidates!', candidates });
    } catch (err) {
        console.log("Error in fetching Candidate:", err)
        res.send({ success: false, message: 'Trouble in fetching candidates! please contact Support team.' });
    }
});

// router.get('/fetch-candidate/:id', async (req, res) => {
//     const { id } = req.params;
//     try {
//         const candidate = await Candidate.findOne({ _id: id }, '-password');
//         if (!candidate) {
//             return res.status(404).json({ success: false, message: 'Candidate not found' });
//         }
//         res.json({ success: true, message: 'Succesfully fetched the Candidate!', candidate });
//     } catch (err) {
//         console.log("Error in fetching Candidates:", err)
//         res.status(500).json({ success: false, message: 'Trouble in fetching candidate! please contact Support team.' });
//     }
// });


router.get('/fetch-candidate/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userRole = req?.session.user.role;
        const userId = req.session.user._id;

        if (!id || !userRole || !['superadmin', 'admin', 'employer', 'job-seeker'].includes(userRole) || !userId) {
            return res.json({ success: false, message: "Invalid request" });
        }

        const candidate = await Candidate.findOne({ _id: id }, '-password');
        if (!candidate) {
            return res.status(404).json({ success: false, message: 'Candidate not found' });
        }

        if (userRole === 'employer') {
            // update User (employer) profileViewHistory
            let userUpdate = await userModel.updateOne(
                { _id: userId, "profileViewHistory.candidateId": candidate._id },
                { $push: { "profileViewHistory.$.viewedAt": new Date() }, $inc: { profileViewCount: 1 } }
            );

            if (userUpdate.modifiedCount === 0) {
                await userModel.updateOne(
                    { _id: userId },
                    {
                        $push: { profileViewHistory: { candidateId: candidate._id, viewedAt: [new Date()]}},
                        $inc: { profileViewCount: 1 }
                    }
                );
            }

            // update Candidate profileViews
            let candidateUpdate = await Candidate.updateOne(
                { candidateID: candidate.candidateID, "profileViewHistory.userId": userId },
                { $push: { "profileViewHistory.$.viewedAt": new Date() }, $inc: { profileViewCount: 1 } }
            );
            if (candidateUpdate.modifiedCount === 0) {
                await Candidate.updateOne(
                    { candidateID: candidate.candidateID },
                    {
                        $push: { profileViewHistory: { userId: userId, viewedAt: [new Date()] } },
                        $inc: { profileViewCount: 1 }
                    }
                );
            }
        }

        return res.json({ success: true, message: 'Successfully fetched the Candidate!', candidate });

    } catch (err) {
        console.log("Error in fetching Candidates:", err);
        res.status(500).json({ success: false, message: 'Trouble in fetching candidate! Please contact Support team.' });
    }
});




module.exports = router;