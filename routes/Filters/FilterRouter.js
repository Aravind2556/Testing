const express = require('express');
const CandidateModel = require("../../models/Candidate")
const router = express.Router();

const findCandidates = async (filter, skip, limit) => {

    const excluded = [
        'password', 'source', 'actualSource', 'sanSpoc', 'ownership',
        'updatedBy', 'createdBy', 'createdOn', 'createdDate', 'updatedOn',
        'applicantStatus', 'recentNoteOn', 'profileSourced'
    ];

    // 2. Build a projection object that excludes them:
    const projection = excluded.reduce((proj, field) => {
        proj[field] = 0;
        return proj;
    }, {});

    const candidates = await CandidateModel
        .find(filter, projection)
        .skip(skip)
        .limit(limit)

    const totalCount = await CandidateModel.countDocuments(filter)
    const totalPages = Math.ceil(totalCount / limit)

    return { candidates, totalCount, totalPages }
}

router.post('/list-candidates', async (req, res) => {
    try {
        const { page, searchTerm, candidatesPerPage } = req.body;
        if (!page || !candidatesPerPage) {
            return res.status(400).json({ success: false, message: "Page or items-per-page is missing." });
        }

        const limit = parseInt(candidatesPerPage, 10);
        const skip = (page - 1) * limit;

        function checkDecimal(value) {
            const decimalRegex = /^[0-9]+$/
            return decimalRegex.test(String(value))
        }

        let pipeline = []
        const regex = { $regex: searchTerm, $options: "i" }

        if (searchTerm && checkDecimal(searchTerm)) {
            pipeline.push(
                {
                    $addFields: {
                        applicantIdStr: { $toString: "$applicantID" },
                        phoneNumberStr: { $toString: "$phoneNumber.number" },
                        alternatePhoneNumberStr: { $toString: "$alternatePhoneNumber.number" }
                    }
                },
                {
                    $match: {
                        $or: [
                            { applicantIdStr: regex },
                            { phoneNumberStr: regex },
                            { alternatePhoneNumberStr: regex }
                        ]
                    }
                },
                {
                    $project: {
                        password: 0,
                        source: 0
                    }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            )
        }
        else if (searchTerm) {

            pipeline.push(
                {
                    $match: {
                        $or: [
                            { firstName: regex },
                            { middleName: regex },
                            { lastName: regex },
                            { applicantName: regex },
                            { applicantFullName: regex },
                            { emailAddress: regex },
                            { alternateEmailAddress: regex },
                            { dateOfBirth: regex },    // matches ISO-string
                            { maritalStatus: regex },
                            { "languages.name": regex },
                            { "presentAddress.city": regex },
                            { "presentAddress.district": regex },
                            { "presentAddress.state": regex },
                            { "presentAddress.country": regex },
                            { "presentAddress.zipCode": regex },
                            { "permanentAddress.city": regex },
                            { "permanentAddress.district": regex },
                            { "permanentAddress.state": regex },
                            { "permanentAddress.country": regex },
                            { "permanentAddress.zipCode": regex },
                            { preferredJob: regex },
                            { preferredLocation: regex },
                            { noticePeriod: regex },
                            { profileSummary: regex },
                            { "primarySkills.primarySkill": regex },
                            { "skills.skill": regex },
                            // Educations: match on each field inside the array
                            { "educations.institutionName": regex },
                            { "educations.courseCategory": regex },
                            { "educations.courseName": regex },
                            // ...add other education sub-fields as needed...
                            // Experiences
                            { "experiences.jobTitle": regex },
                            { "experiences.employer": regex },
                            { "experiences.description": regex },
                            // Projects
                            { "projects.projectName": regex },
                            { "projects.clientName": regex },
                            { "projects.description": regex },
                            // Certifications
                            { "certifications.certificationName": regex },
                            { "certifications.organization": regex }
                            // (You can continue listing any other nested subfields you care about)
                        ]
                    }
                },
                {
                    $project: {
                        password: 0,
                        source: 0
                    }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            )
        }
        else {
            pipeline.push(
                {
                    $match: {}
                },
                {
                    $project: {
                        password: 0,
                        source: 0
                    }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            )
        }

        // const fetchCandidates = await CandidateModel.find(filter, '-password -source').skip(skip).limit(limit)
        const fetchCandidates = await CandidateModel.aggregate(pipeline);
        // same initial stages up through your $match,
        const countPipeline = pipeline
            .slice(0, pipeline.findIndex(s => "$project" in s))  // up through $match
            .concat({ $count: "total" });

        const countResult = await CandidateModel.aggregate(countPipeline);
        const totalCandidates = countResult[0]?.total || 0;

        // const totalCandidates = await CandidateModel.countDocuments(pipeline)


        if (!fetchCandidates) {
            return res.status(404).json({ success: false, message: "Failed to fetch Candidates! please contact Support Team." })
        }

        return res.status(200).json({
            success: true,
            candidates: fetchCandidates,
            totalPages: Math.ceil(totalCandidates / limit),
            totalCandidates: totalCandidates,
            message: "Succesfully fetched the Candidates!"
        })


    }
    catch (err) {
        console.error('Error listing candidates:', err);
        return res.status(500).json({ success: false, message: 'Server error listing candidates.' });
    }
});


router.post('/list-candidate', async (req, res) => {
    try {
        const { page, searchTerm, candidatesPerPage, searchType, filterOptions } = req.body;
        if (!page || !candidatesPerPage) {
            return res.status(400).json({ success: false, message: "Page or items-per-page is missing." });
        }

        if (!searchType) {
            return res.status(400).json({ success: false, message: "Search Type is missing! please contact Support team." });
        }

        if (searchType === "proSearch" && (!filterOptions || typeof filterOptions !== "object" || Object.keys(filterOptions).length <= 0)) {
            return res.status(400).json({ success: false, message: "Failed to read serach options! please contact Support team." });
        }

        const limit = parseInt(candidatesPerPage, 10);
        const skip = (page - 1) * limit;

        const excludeFields = [
            'password', 'source', 'actualSource', 'sanSpoc', 'ownership',
            'updatedBy', 'createdBy', 'createdOn', 'createdDate', 'updatedOn',
            'applicantStatus', 'recentNoteOn', 'profileSourced'
        ];

        const stringFields = Object
            .keys(Candidate.schema.paths)
            .filter(path => {
                const sch = Candidate.schema.paths[path];
                return sch.instance === 'String'
                    || (sch.instance === 'Array' && sch.caster?.instance === 'String');
            })
            .filter(path => !excludeFields.includes(path));

        let filter = {};


        if (searchType === "search" && searchTerm) {
            const orConditions = [];

            // 1) substring search on every string field
            stringFields.forEach(field => {
                orConditions.push({ [field]: { $regex: searchTerm, $options: 'i' } });
            });

            // 2) applicantID exact match, but phone‐numbers as substring
            const num = Number(searchTerm);
            if (!isNaN(num)) {
                // exact applicantID
                orConditions.push({ applicantID: num });

                // substring match on phone numbers (convert number→string)
                orConditions.push({
                    $expr: {
                        $regexMatch: {
                            input: { $toString: "$phoneNumber.number" },
                            regex: searchTerm
                        }
                    }
                });
                orConditions.push({
                    $expr: {
                        $regexMatch: {
                            input: { $toString: "$alternatePhoneNumber.number" },
                            regex: searchTerm
                        }
                    }
                });
            }


            // 3) exact‐date match
            const date = new Date(searchTerm);
            if (!isNaN(date.getTime())) {
                orConditions.push(
                    { dateOfBirth: date },
                    { lwd: date },
                    { noticePeriodServingDate: date }
                );
            }

            filter = { $or: orConditions };
        }

        // if (searchType === "proSearch" && Object.keys(filterOptions) > 0) {

        //     const filterObjKeys = Object.keys(filterOptions)
        //     const validKeys = ["inputBlock", "selectedDepartment", "selectedRole", "selectedEducation", "selectedState", "selectDistrict", "enteredCity", "enteredRange", "noticePeriods", "lastWorkingDays", "resumeSearch", "resumeAvailability", "relocation", "salaryStatus", "excludeDisability"]
        //     validKeys.forEach(key => {
        //         const checkKeyStatus = filterObjKeys.some(item => item === key)
        //         if (!checkKeyStatus) {
        //             return res.status(400).json({ success: false, message: "Some data in Search options aren't found! Please contact Support Team." })
        //         }

        //         if (key === "inputBlock") {
        //             const inputObj = filterOptions[key]
        //             const inputObjKeys = Object.keys(inputObj)
        //             const validInputObjKey = ["Keyword", "Company", "Designation"]

        //             validInputObjKey.forEach(validKey => {
        //                 const checkIpKeys = inputObjKeys.some(ipObj => ipObj === validKey)
        //                 if (!checkIpKeys) {
        //                     return res.status(400).json({ success: false, message: "Some data in Search option Input block aren't found! please contact Support Team" })
        //                 }

        //                 const inputChildKeys = Object.keys(inputObj[validKey])
        //                 const validChildInputObjKeys = ["inputText", "boolean", "searchCurrent", "mandatory", "exclude", "excludeText"]
        //                 validChildInputObjKeys.forEach(validChildKey => {
        //                     const checkChildIpKeys = inputChildKeys.some(childIpObj => childIpObj === validChildKey)
        //                     if (!checkChildIpKeys) {
        //                         return res.status(400).json({ success: false, message: "Some data objects in Search option Input block aren't found! please contact Support Team" })
        //                     }
        //                 })

        //             })

        //             if(inputObj?.Keyword?.inputText){
        //                 if(inputObj?.Keyword?.mandatory){

        //                 }
        //                 else if(inputObj?.Keyword?.boolean){

        //                 }

        //                 if(inputObj?.Keyword?.searchCurrent){

        //                 }

        //                 if(inputObj?.Keyword?.exclude && inputObj?.Keyword?.excludeText){
        //                     const excludingKeyword = parseKeywords(inputObj.Keyword.excludeText || "")

        //                 }
        //             }


        //         }
        //         else if (key === "enteredRange") {
        //             const enteredRangeObj = filterOptions[key]
        //             const enteredRangeObjKeys = Object.keys(enteredRangeObj)
        //             const validEnteredObjKeys = ["Age", "Experience", "Expected Salary"]

        //             validEnteredObjKeys.forEach(validEnteredKey => {
        //                 const checkEnteredObjKey = enteredRangeObjKeys.some(entObjKey => entObjKey === validEnteredKey)
        //                 if (!checkEnteredObjKey) {
        //                     return res.status(400).json({ success: false, message: "Some data in Search option range block aren't found! please contact Support Team" })
        //                 }

        //                 const enteredObjChildKeys = Object.keys(enteredRangeObj[validEnteredKey])
        //                 const validEnteredChildObjKeys = ["min", "max"]
        //                 validEnteredChildObjKeys.forEach(validEntChildKey => {
        //                     const checkEntChildObjKey = enteredObjChildKeys.some(entChildItem => entChildItem === validEntChildKey)
        //                     if (!checkEntChildObjKey) {
        //                         return res.status(400).json({ success: false, message: "Some data objects in Search option Entered Range block object aren't found! please contact Support Team" })
        //                     }
        //                 })
        //             })
        //         }

        //     })

        // }



        const totalCandidates = await CandidateModel.countDocuments(filter);
        const totalPages = Math.ceil(totalCandidates / limit);

        const candidates = await CandidateModel.find(filter, '-password -source')
            .skip(skip)
            .limit(limit);

        return res.json({
            success: true,
            candidates,
            totalPages,
            totalCandidates
        });
    } catch (err) {
        console.error('Error listing candidates:', err);
        return res.status(500).json({ success: false, message: 'Server error listing candidates.' });
    }
});

router.post('/fetch-job-titles', async (req, res) => {
    try {
        const {keyword} = req.body;

        if(!keyword){
            return res.status(404).json({success: false, message: "Keyword is missing! please contact support Team."})
        }

        let jobTitles = await CandidateModel.distinct('experiences.jobTitle', {
            'experiences.jobTitle': {$regex: keyword, $options: 'i'}
        });

        if (!Array.isArray(jobTitles)) {
            return res.status(404).json({
                success: false,
                message: 'Failed to fetch Job Titles! please contact support team.'
            });
        }

        const stripQuotes = title =>
            title
                // remove any leading or trailing ' or "
                .replace(/^['"]+|['"]+$/g, '')
                .trim();

        jobTitles = jobTitles
            .map(stripQuotes)
            // drop any empties
            .filter(t => t.length > 0)
            // dedupe
            .filter((t, i, arr) => arr.indexOf(t) === i)
            .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

        return res.status(200).json({
            success: true,
            jobTitles,
            message: "Successfully fetched Job Titles!"
        })
    }
    catch (err) {
        console.error('Error fetching job titles:', err);
        return res.status(500).json({ success: false, message: 'Trouble in fetching job titles.' });
    }
})

router.post('/fetch-educations', async (req, res) => {
    try {
        const {keyword} = req.body;

        if(!keyword){
            return res.status(404).json({success: false, message: "Keyword is missing! please contact support Team."})
        }

        let educations = await CandidateModel.distinct('educations.courseName', {
            'educations.courseName': {$regex: keyword, $options: 'i'}
        });

        if (!Array.isArray(educations)) {
            return res.status(404).json({
                success: false,
                message: 'Failed to fetch educations! please contact support team.'
            });
        }

        const stripQuotes = title =>
            title
                // remove any leading or trailing ' or "
                .replace(/^['"]+|['"]+$/g, '')
                .trim();

        educations = educations
            .map(stripQuotes)
            // drop any empties
            .filter(t => t.length > 0)
            // dedupe
            .filter((t, i, arr) => arr.indexOf(t) === i)
            .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

        return res.status(200).json({
            success: true,
            educations,
            message: "Successfully fetched educations!"
        })
    }
    catch (err) {
        console.error('Error fetching educations:', err);
        return res.status(500).json({ success: false, message: 'Trouble in fetching educations.' });
    }
})


module.exports = router