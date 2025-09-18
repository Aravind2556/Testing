const Express = require('express')

const Candidate = require('../../models/Candidate')
const isAuth = require('../../middleware/isAuth')
const buildBooleanQuery = require('../../utils/AdvanceFilter/ExtractBooleanInSensitive')
const excludeBadges = require('../../utils/AdvanceFilter/ExcludeBadges')
const extractTextFromResume = require('../../utils/AdvanceFilter/ExtractTextFromResume')
const resumeMatches = require('../../utils/AdvanceFilter/ResumeMatch')

const router = Express.Router()


// const fieldsToSearch = [
//     "applicantIdStr",
//     "presentAddressZipcodeStr",
//     "permanentAddressZipcodeStr",
//     "phoneNumberStr",
//     "alternatePhoneNumberStr",
//     "languages.name",
//     "presentAddress.city",
//     "presentAddress.district",
//     "presentAddress.state",
//     "presentAddress.zipCode",
//     "permanentAddress.city",
//     "permanentAddress.district",
//     "permanentAddress.state",
//     "permanentAddress.zipCode",
//     "preferredJob",
//     "preferredLocation",
//     "profileSummary",
//     "primarySkills.primarySkill",
//     "skills.skill",
//     "educations.institutionName",
//     "educations.courseName",
//     "experiences.jobTitle",
//     "experiences.employer",
//     "experiences.description",
//     "projects.projectName",
//     "projects.clientName",
//     "projects.description",
//     "certifications.certificationName",
//     "certifications.description"
// ]

const fieldsToSearch = [
    "applicantIdStr",
    "languages.name",
    "presentAddress.city",
    "presentAddress.district",
    "presentAddress.state",
    "presentAddress.zipCode",
    "permanentAddress.city",
    "permanentAddress.district",
    "permanentAddress.state",
    "permanentAddress.zipCode",
    "preferredJob",
    "preferredLocation",
    "profileSummary",
    "primarySkills.primarySkill",
    "skills.skill",
    "educations.institutionName",
    "educations.courseName",
    "experiences.jobTitle",
    "experiences.employer",
    "experiences.description",
    "projects.projectName",
    "projects.clientName",
    "projects.description",
    "certifications.certificationName",
    "certifications.description"
]



router.post('/advance-filter', async (req, res) => {
    try {
        const {
            keyword, company, designation, age, experience, salary, locationType, selectedCities, selectedState, selectedDistrict, includePreferredLocation,
            selectedEducation, selectedGender, selectedNegotiableNoticePeriod, selectedNoticePeriod, lastWorkingDay, skills, resumeSearch, resumeAvailability,
            relocation, salaryStatus, excludeDisability, itemsPerPage, currentPage
        } = req.body


        if (!itemsPerPage || !currentPage) {
            console.log("check itemsPerPage")
            return res.status(404).json({ success: false, message: "Page and Items data are not found! please contact support team." })
        }

        const limit = parseInt(itemsPerPage, 10);
        const skip = (currentPage - 1) * limit;
        if (!limit || (!skip && skip !== 0)) {
            console.log("check limit")
            return res.status(404).json({ success: false, message: "Page and Items data are not found! please contact support team." })
        }

        function escapeRegex(s) {
            return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
        const regex = (term) => ({ $regex: `\\b${escapeRegex(term)}\\b`, $options: "i" });


        let pipeline = []

        let keywordMatchFilter = {}
        let companyMatchFilter = {}
        let designationMatchFilter = {}
        let ageMatchFilter = {}
        let experienceMatchFilter = {}
        let salaryMatchFilter = {}
        let cityMatchFilter = {}
        let regionMatchFilter = {}
        let educationMatchFilter = {}
        let genderMatchFilter = {}
        let negotiableNoticeMatchFilter = {}
        let noticePeriodMatchFilter = {}
        let skillsMatchFilter = {}
        let resumeAvailabilityMatchFilter = {}
        let relocationMatchFilter = {}
        let salaryStatusMatchFilter = {}
        let excludeDisabilityMatchFilter = {}
        let resumeSearchMatchFilter = {}

        let keywordMandatoryBadges
        let keywordOptionalBadges
        let keywordBoolean

        let companyMandatoryBadges
        let companyOptionalBadges
        let companyBoolean

        let designationMandatoryBadges
        let designationOptionalBadges
        let designationBoolean

        let cities
        let regions
        let skillsKeywords = []



        if (keyword && typeof keyword === 'object' && Object.entries(keyword).length > 0) {

            pipeline.push({
                $addFields: {
                    applicantIdStr: { $toString: "$applicantID" },
                    presentAddressZipcodeStr: { $toString: "$presentAddress.zipCode" },
                    permanentAddressZipcodeStr: { $toString: "$permanentAddress.zipCode" },
                    phoneNumberStr: { $toString: "$phoneNumber.number" },
                    alternatePhoneNumberStr: { $toString: "$alternatePhoneNumber.number" },
                }
            })

            if (!keyword?.boolean && Array.isArray(keyword?.badges) && keyword.badges.length > 0) {
                const mandatoryBadges = keyword.badges.filter(b => b.mandatory === true).map(b => b.keyword.toLowerCase());
                const optionalBadges = keyword.badges.filter(b => b.mandatory !== true).map(b => b.keyword.toLowerCase());

                if (mandatoryBadges.length > 0) {
                    keywordMandatoryBadges = mandatoryBadges;
                    keywordMatchFilter.$and = mandatoryBadges.map(mand => ({
                        $or: fieldsToSearch.map(field => ({ [field]: regex(mand) }))
                    }));
                    // NOTE: Optional are NOT required, so we do not add them to the match when mandatory exist.
                } else if (optionalBadges.length > 0) {
                    keywordOptionalBadges = optionalBadges;
                    keywordMatchFilter.$or = optionalBadges.flatMap(opt =>
                        fieldsToSearch.map(field => ({ [field]: regex(opt) }))
                    );
                }

                if (keyword?.exclude && Array.isArray(keyword.excludeBadges) && keyword.excludeBadges.length > 0) {
                    const validateExcludingFilter = await excludeBadges("Keyword", keyword, fieldsToSearch);
                    if (validateExcludingFilter?.success) {
                        keywordMatchFilter.$nor = [validateExcludingFilter.excludingFilter];
                    } else if (validateExcludingFilter?.success === false) {
                        return res.status(400).json(validateExcludingFilter);
                    }
                }
            }
            else if (keyword?.boolean && keyword?.inputText.length > 0) {
                const mongoQuery = await buildBooleanQuery(keyword.inputText, fieldsToSearch, keyword, "keyword");

                if (!mongoQuery) {
                    return res.status(400).json({ success: false, message: "Failed to parse Boolean keywords! please check the format." })
                }

                if (mongoQuery.response !== "ok") {
                    return res.status(400).json({ success: false, message: mongoQuery.message })
                }
                keywordBoolean = mongoQuery.filter

                keywordMatchFilter = mongoQuery.filter
            }
            else if (!keyword?.boolean && keyword?.exclude && keyword?.badges.length === 0 && keyword?.excludeBadges && keyword.excludeBadges.length > 0 && Array.isArray(keyword.excludeBadges)) {
                let validateExcludingFilter = await excludeBadges("Keyword", keyword, fieldsToSearch)

                if (validateExcludingFilter?.success) {
                    keywordMatchFilter = {
                        $nor: [validateExcludingFilter.excludingFilter]
                    }
                }
                else if (validateExcludingFilter?.success === false) {
                    return res.status(400).json(validateExcludingFilter)
                }
            }

            if (typeof keywordMatchFilter !== 'object') {
                return res.status(400).json({ success: false, message: "Search Query isn't found!" })
            }
        }

        if (!company?.boolean && Array.isArray(company?.badges) && company.badges.length > 0) {
            const mandatoryBadges = company.badges.filter(b => b.mandatory === true).map(b => b.keyword.toLowerCase());
            const optionalBadges = company.badges.filter(b => b.mandatory === false).map(b => b.keyword.toLowerCase());

            const ongoingFilter = (company?.searchCurrent || company?.searchPrevious)
                ? (company?.searchCurrent && !company?.searchPrevious)
                    ? { isOngoing: true }
                    : (!company?.searchCurrent && company?.searchPrevious)
                        ? { isOngoing: { $ne: true } }
                        : {}
                : {};

            const parts = [];

            if (mandatoryBadges.length > 0) {
                companyMandatoryBadges = mandatoryBadges;
                parts.push({
                    experiences: {
                        $all: mandatoryBadges.map(kw => ({ $elemMatch: { employer: regex(kw), ...ongoingFilter } }))
                    }
                });
                // optional NOT required when mandatory exist -> do nothing for optional here
            } else if (optionalBadges.length > 0) {
                companyOptionalBadges = optionalBadges;
                parts.push({
                    $or: optionalBadges.map(kw => ({ experiences: { $elemMatch: { employer: regex(kw), ...ongoingFilter } } }))
                });
            }

            if (company?.exclude && Array.isArray(company.excludeBadges) && company.excludeBadges.length > 0) {
                const validateExcludingFilter = await excludeBadges("company", company, ["experiences.employer"]);
                if (validateExcludingFilter?.success) {
                    parts.push({ $nor: [validateExcludingFilter.excludingFilter] });
                } else if (validateExcludingFilter?.success === false) {
                    return res.status(400).json(validateExcludingFilter);
                }
            }

            if (parts.length) companyMatchFilter.$and = parts;
        }
        else if (company?.boolean && company?.inputText?.length > 0) {
            const mongoQuery = await buildBooleanQuery(company.inputText, ["experiences.employer"], company, "company");
            if (!mongoQuery || mongoQuery.response !== "ok") {
                return res.status(400).json({ success: false, message: mongoQuery?.message || "Failed to parse boolean Company names ! please check the format." });
            }
            companyBoolean = mongoQuery.filter;
            companyMatchFilter = mongoQuery.filter;
        }
        else if (!company?.boolean && (!company?.badges || company.badges.length === 0) &&
            company?.exclude && Array.isArray(company.excludeBadges) && company.excludeBadges.length > 0) {
            const validateExcludingFilter = await excludeBadges("company", company, ["experiences.employer"]);
            if (validateExcludingFilter?.success) {
                companyMatchFilter = { $nor: [validateExcludingFilter.excludingFilter] };
            } else if (validateExcludingFilter?.success === false) {
                return res.status(400).json(validateExcludingFilter);
            }
        }



        if (!designation?.boolean && Array.isArray(designation?.badges) && designation.badges.length > 0) {
            const mandatoryBadges = designation.badges.filter(b => b.mandatory === true).map(b => b.keyword.toLowerCase());
            const optionalBadges = designation.badges.filter(b => b.mandatory === false).map(b => b.keyword.toLowerCase());

            const ongoingFilter = (designation?.searchCurrent || designation?.searchPrevious)
                ? (designation?.searchCurrent && !designation?.searchPrevious)
                    ? { isOngoing: true }
                    : (!designation?.searchCurrent && designation?.searchPrevious)
                        ? { isOngoing: { $ne: true } }
                        : {}
                : {};

            const parts = [];

            if (mandatoryBadges.length > 0) {
                designationMandatoryBadges = mandatoryBadges;
                parts.push({
                    experiences: {
                        $all: mandatoryBadges.map(kw => ({ $elemMatch: { jobTitle: regex(kw), ...ongoingFilter } }))
                    }
                });
            } else if (optionalBadges.length > 0) {
                designationOptionalBadges = optionalBadges;
                parts.push({
                    $or: optionalBadges.map(kw => ({ experiences: { $elemMatch: { jobTitle: regex(kw), ...ongoingFilter } } }))
                });
            }

            if (designation?.exclude && Array.isArray(designation.excludeBadges) && designation.excludeBadges.length > 0) {
                const validateExcludingFilter = await excludeBadges("designation", designation, ["experiences.jobTitle"]);
                if (validateExcludingFilter?.success) {
                    parts.push({ $nor: [validateExcludingFilter.excludingFilter] });
                } else if (validateExcludingFilter?.success === false) {
                    return res.status(400).json(validateExcludingFilter);
                }
            }

            if (parts.length) designationMatchFilter.$and = parts;
        }
        else if (designation?.boolean && designation?.inputText?.length > 0) {
            const mongoQuery = await buildBooleanQuery(designation.inputText, ["experiences.jobTitle"], designation, "designation");
            if (!mongoQuery || mongoQuery.response !== "ok") {
                return res.status(400).json({ success: false, message: mongoQuery?.message || "Failed to parse boolean designation names ! please check the format." });
            }
            designationBoolean = mongoQuery.filter;
            designationMatchFilter = mongoQuery.filter;
        }
        else if (!designation?.boolean && (!designation?.badges || designation.badges.length === 0) &&
            designation?.exclude && Array.isArray(designation.excludeBadges) && designation.excludeBadges.length > 0) {
            const validateExcludingFilter = await excludeBadges("designation", designation, ["experiences.jobTitle"]);
            if (validateExcludingFilter?.success) {
                designationMatchFilter = { $nor: [validateExcludingFilter.excludingFilter] };
            } else if (validateExcludingFilter?.success === false) {
                return res.status(400).json(validateExcludingFilter);
            }
        }



        const numberRegex = value => /^\d+$/.test(value)

        if (age && typeof age === 'object' && ((age.min && numberRegex(age.min)) || (age.max && numberRegex(age.max)))) {
            const minAge = Number(age.min)
            const maxAge = Number(age.max)
            let tempAgeFilter = []

            pipeline.push({
                $addFields: {
                    age: {
                        $floor: {
                            $divide: [
                                { $subtract: [new Date(), "$dateOfBirth"] },
                                1000 * 60 * 60 * 24 * 365
                            ]
                        }
                    }
                }
            })

            if (minAge && typeof minAge === 'number') {
                tempAgeFilter.push({ ["age"]: { $gte: minAge } })
            }

            if (maxAge && typeof maxAge === 'number') {
                tempAgeFilter.push({ ["age"]: { $lte: maxAge } })
            }

            if (tempAgeFilter.length > 0)
                ageMatchFilter.$and = tempAgeFilter
        }

        const decimalRegex = value => /^\d+(\.\d+)?$/.test(value)

        // --- Experience range (candidate total) ---
        if (experience && typeof experience === 'object' && ((experience.min && decimalRegex(experience.min)) || (experience.max && decimalRegex(experience.max)))) {
            let minExperience, maxExperience;

            pipeline.push({
                $addFields: {
                    expMonth: { $add: [{ $multiply: ["$experience.year", 12] }, "$experience.month"] }
                }
            });

            if (experience.min) {
                if (experience.min.includes('.')) {
                    const [y, m] = experience.min.split('.');
                    minExperience = (Number(y || 0) * 12) + Math.min(Number(m || 0), 11);
                } else if (numberRegex(experience.min)) {
                    minExperience = Number(experience.min) * 12;
                }
            }
            if (experience.max) {
                if (experience.max.includes('.')) {
                    const [y, m] = experience.max.split('.');
                    maxExperience = (Number(y || 0) * 12) + Math.min(Number(m || 0), 11);
                } else if (numberRegex(experience.max)) {
                    maxExperience = Number(experience.max) * 12;
                }
            }

            const tempExpFilter = [];
            if (typeof minExperience === 'number') tempExpFilter.push({ expMonth: { $gte: minExperience } });
            if (typeof maxExperience === 'number') tempExpFilter.push({ expMonth: { $lte: maxExperience } });

            if (tempExpFilter.length) experienceMatchFilter.$and = tempExpFilter;
        }


        if (salary && typeof salary === 'object' && ((salary.min && decimalRegex(salary.min)) || (salary.max && decimalRegex(salary.max)))) {
            let tempSalaryFilter = []
            const minSalary = decimalRegex(salary.min) && Number(salary.min)
            const maxSalary = decimalRegex(salary.max) && Number(salary.max)

            if (Number.isFinite(minSalary)) {
                tempSalaryFilter.push({ "expectedCTC.amount": { $gte: minSalary } })
            }

            if (Number.isFinite(maxSalary)) {
                tempSalaryFilter.push({ "expectedCTC.amount": { $lte: maxSalary } })
            }

            if (tempSalaryFilter.length > 0) {
                salaryMatchFilter.$and = tempSalaryFilter
            }
        }

        if (locationType && locationType === 'city' && selectedCities && Array.isArray(selectedCities) && selectedCities.length > 0) {
            const valuesOfSelectedCitites = selectedCities.map(city => city.value)

            if (valuesOfSelectedCitites && valuesOfSelectedCitites.length > 0) {
                cities = valuesOfSelectedCitites
                let tempCityFilter = []
                for (const city of valuesOfSelectedCitites) {
                    if (includePreferredLocation) {
                        tempCityFilter.push({ ["preferredLocation"]: regex(city) })
                    }

                    tempCityFilter.push({ ["presentAddress.addressLine1"]: regex(city) })
                    tempCityFilter.push({ ["presentAddress.addressLine2"]: regex(city) })
                    tempCityFilter.push({ ["presentAddress.city"]: regex(city) })
                    tempCityFilter.push({ ["presentAddress.district"]: regex(city) })
                    tempCityFilter.push({ ["presentAddress.state"]: regex(city) })
                    tempCityFilter.push({ ["presentAddress.country"]: regex(city) })
                }

                if (tempCityFilter.length > 0) {
                    cityMatchFilter.$or = tempCityFilter
                }
            }
            else {
                console.log("check valuesOfSelectedCitites")
                return res.status(404).json({ success: false, message: "Failed to extract the values of selected cities! please contact support team." })
            }
        }

        if (locationType && locationType === 'region' && (selectedDistrict || selectedState)) {
            let tempRegionFilter = []

            if (selectedDistrict && selectedState) {
                regions = [selectedDistrict, selectedState]
                tempRegionFilter.push({
                    $and: [
                        {
                            $or: [
                                { ["presentAddress.addressLine1"]: regex(selectedDistrict) },
                                { ["presentAddress.addressLine2"]: regex(selectedDistrict) },
                                { ["presentAddress.city"]: regex(selectedDistrict) },
                                { ["presentAddress.district"]: regex(selectedDistrict) }
                            ]
                        },
                        { ["presentAddress.state"]: regex(selectedState) }
                    ]
                })
            }
            else if (selectedDistrict) {
                regions = [selectedDistrict]
                tempRegionFilter.push({
                    $or: [
                        { ["presentAddress.addressLine1"]: regex(selectedDistrict) },
                        { ["presentAddress.addressLine2"]: regex(selectedDistrict) },
                        { ["presentAddress.city"]: regex(selectedDistrict) },
                        { ["presentAddress.district"]: regex(selectedDistrict) }
                    ]
                })
            }
            else if (selectedState) {
                regions = [selectedState]
                tempRegionFilter.push({ ["presentAddress.state"]: regex(selectedState) })
            }

            if (includePreferredLocation) {
                if (selectedDistrict && selectedState) {
                    tempRegionFilter.push({ ["preferredLocation"]: regex(selectedDistrict) })
                    tempRegionFilter.push({ ["preferredLocation"]: regex(selectedState) })
                }
                else if (selectedDistrict) {
                    tempRegionFilter.push({ ["preferredLocation"]: regex(selectedDistrict) })
                }
                else if (selectedState) {
                    tempRegionFilter.push({ ["preferredLocation"]: regex(selectedState) })
                }

            }

            if (tempRegionFilter.length > 0) {
                regionMatchFilter.$or = tempRegionFilter
            }
        }

        if (selectedEducation && Array.isArray(selectedEducation) && selectedEducation.length > 0) {
            const valuesOfSelectedEducation = selectedEducation.map(education => education.value)

            if (valuesOfSelectedEducation && valuesOfSelectedEducation.length > 0) {
                let tempEducationFilter = []
                for (const education of valuesOfSelectedEducation) {
                    tempEducationFilter.push({ ["educations.courseName"]: regex(education) })
                    tempEducationFilter.push({ ["educations.courseCategory"]: regex(education) })
                }

                if (tempEducationFilter.length > 0) {
                    educationMatchFilter.$or = tempEducationFilter
                }
            }
            else {
                return res.status(400).json({ success: false, message: "Failed to fetch the values of Education! please contact support team." })
            }
        }

        if (selectedGender) {
            let tempGenderFilter

            if (selectedGender === "male") {
                tempGenderFilter = { gender: "male" }
            }
            else if (selectedGender === "female") {
                tempGenderFilter = { gender: "female" }
            }
            else if (selectedGender === "others") {
                tempGenderFilter = { gender: "other" }
            }
            else if (selectedGender === "any") {
                tempGenderFilter = {}
            }


            if (tempGenderFilter) {
                genderMatchFilter = tempGenderFilter
            }
        }

        if (selectedNegotiableNoticePeriod && Array.isArray(selectedNegotiableNoticePeriod) && selectedNegotiableNoticePeriod.length > 0) {
            const valuesOfNegotiableNotice = selectedNegotiableNoticePeriod.map(negotiableNotice => negotiableNotice.value)

            if (valuesOfNegotiableNotice && valuesOfNegotiableNotice.length > 0) {
                let tempNegotiableNoticeFilter = []

                for (const negotiableNotice of valuesOfNegotiableNotice) {
                    tempNegotiableNoticeFilter.push({ negotiableNoticePeriod: negotiableNotice.toLowerCase().trim() })
                }

                if (tempNegotiableNoticeFilter && tempNegotiableNoticeFilter.length > 0) {
                    negotiableNoticeMatchFilter.$or = tempNegotiableNoticeFilter
                }
            }
            else {
                return res.status(400).json({ success: false, message: "Failed to fetch the values of negiotiable Notice! please contact support team." })
            }
        }

        if (selectedNoticePeriod && Array.isArray(selectedNoticePeriod) && selectedNoticePeriod.length > 0) {
            const valuesOfNotice = selectedNoticePeriod.map(negotiableNotice => negotiableNotice.toLowerCase().trim())

            if (valuesOfNotice && valuesOfNotice.length > 0) {
                let tempNoticeFilter = []

                for (const noticePeriod of valuesOfNotice) {
                    tempNoticeFilter.push({ noticePeriod })
                }

                if (tempNoticeFilter && tempNoticeFilter.length > 0) {
                    if (lastWorkingDay) {

                    }
                    noticePeriodMatchFilter.$or = tempNoticeFilter
                }
            }
            else {
                return res.status(400).json({ success: false, message: "Failed to fetch the values of Notice period! please contact support team." })
            }
        }

        if (skills && Array.isArray(skills) && skills.length > 0) {

            pipeline.push({
                $addFields: {
                    skills: {
                        $map: {
                            input: "$skills",
                            as: "skill",
                            in: {
                                $mergeObjects: [
                                    "$$skill",
                                    {
                                        skillExpMonth: {
                                            $add: [
                                                { $multiply: ["$$skill.experience.year", 12] },
                                                "$$skill.experience.month"
                                            ]
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            });


            let tempSkillFilter = []

            for (const skill of skills) {
                let tempSkillObj = []

                if (skill) {
                    if (skill.skill) {
                        skillsKeywords.push(skill.skill)
                        tempSkillObj.push({ ["skills.skill"]: regex(skill.skill) })
                    }

                    // --- Skills min/max per-skill ---
                    if (skill.min) {
                        let minMonths;
                        if (skill.min.includes('.')) {
                            const [y, m] = skill.min.split('.');
                            minMonths = (Number(y || 0) * 12) + Math.min(Number(m || 0), 11);
                        } else if (numberRegex(skill.min)) {
                            minMonths = Number(skill.min) * 12;
                        }
                        if (typeof minMonths === 'number') tempSkillObj.push({ "skills.skillExpMonth": { $gte: minMonths } });
                    }
                    if (skill.max) {
                        let maxMonths;
                        if (skill.max.includes('.')) {
                            const [y, m] = skill.max.split('.');
                            maxMonths = (Number(y || 0) * 12) + Math.min(Number(m || 0), 11);
                        } else if (numberRegex(skill.max)) {
                            maxMonths = Number(skill.max) * 12;
                        }
                        if (typeof maxMonths === 'number') tempSkillObj.push({ "skills.skillExpMonth": { $lte: maxMonths } }); // << was $gte
                    }

                }
                if (tempSkillObj.length) {
                    // Convert the flat conditions into a single elemMatch object
                    const elemMatch = {};
                    for (const cond of tempSkillObj) {
                        const [[field, value]] = Object.entries(cond);
                        // strip the leading "skills." so it becomes field inside the array element
                        const innerField = field.replace(/^skills\./, "");
                        elemMatch[innerField] = value;
                    }
                    tempSkillFilter.push({ skills: { $elemMatch: elemMatch } });
                }

            }

            if (tempSkillFilter && tempSkillFilter.length > 0) {
                skillsMatchFilter.$and = tempSkillFilter
            }
        }

        if (resumeAvailability === true) {
            resumeAvailabilityMatchFilter.$and = [
                { resumeLink: { $exists: true } },
                { resumeAvailable: true }
            ]
        }

        if (relocation === true) {
            relocationMatchFilter = { relocation: true }
        }

        if (salaryStatus === true) {
            salaryStatusMatchFilter.$or = [
                { "expectedCTC": { $exists: false } },
                { "expectedCTC.amount": { $exists: false } },
                { "expectedCTC.amount": null }
            ];
        }


        if (excludeDisability === true) {
            excludeDisabilityMatchFilter = { "disability.isDisabled": { $ne: true } }
        }

        if (resumeSearch === true) {
            resumeSearchMatchFilter.$and = [
                { resumeLink: { $exists: true } },
                { resumeAvailable: true }
            ]
        }


        const tempMatchFilter = []

        const filters = [
            keywordMatchFilter, companyMatchFilter, designationMatchFilter, ageMatchFilter, experienceMatchFilter, salaryMatchFilter,
            cityMatchFilter, regionMatchFilter, educationMatchFilter, genderMatchFilter, negotiableNoticeMatchFilter, noticePeriodMatchFilter, skillsMatchFilter,
            resumeAvailabilityMatchFilter, relocationMatchFilter, salaryStatusMatchFilter, excludeDisabilityMatchFilter, resumeSearchMatchFilter
        ]
    

        for (const filter of filters) {
            if (filter && typeof filter === 'object' && Object.entries(filter).length > 0)
                tempMatchFilter.push(filter)
        }

        if (tempMatchFilter.length > 0) {
            pipeline.push({
                $match: {
                    $and: tempMatchFilter
                }
            })
        }

        pipeline.push(
            {
                $project: {
                    password: 0,
                    source: 0,
                    age: 0,
                    expMonth: 0,
                    applicantIdStr: 0,
                    presentAddressZipcodeStr: 0,
                    permanentAddressZipcodeStr: 0,
                    phoneNumberStr: 0,
                    alternatePhoneNumberStr: 0
                }
            }
        )

        if (!pipeline) {
            console.log("check pipeline")
            return res.status(404).json({ success: false, message: "Failed to generate find filter! please contact support team." })
        }

        const fetchTotalCandidates = await Candidate.aggregate([...pipeline, { $count: "total" }])

        if (!fetchTotalCandidates) {
            console.log("check fetchTotalCandidates")
            return res.status(404).json({ success: false, message: "Failed to count Total data! please contact support team." })
        }

        const totalCandidates = fetchTotalCandidates[0]?.total || 0

        pipeline.push({
            $facet: {
                data: [
                    { $skip: skip },
                    { $limit: limit }
                ],
                totalCount: [
                    { $count: "count" }
                ]
            }
        })

        const fetchCandidates = await Candidate.aggregate(pipeline)

        if (!fetchCandidates || !fetchCandidates[0].data) {
            console.log("check fetchCandidates:")
            return res.status(404).json({ success: false, message: "Failed to fetch Candidates! please contact Support Team.", fetchCandidates: fetchCandidates })
        }

        const fetchedCandidatesCount = fetchCandidates[0].totalCount[0]?.count || 0

        let filteredCandidates = []

        if (fetchCandidates && fetchCandidates.length > 0) {
            filteredCandidates.push(...fetchCandidates[0].data)
        }

        let remainingCandidateCount = (limit - fetchedCandidatesCount) || 0

        if (resumeSearch === true && fetchedCandidatesCount < limit) {

            const dbCandidates = await Candidate.aggregate([
                {
                    $match: {
                        $and: [
                            { resumeLink: { $exists: true } },
                            { resumeAvailable: true }
                        ]
                    }
                },
                {
                    $project: {
                        password: 0,
                        source: 0,
                        age: 0,
                        expMonth: 0,
                        applicantIdStr: 0,
                        presentAddressZipcodeStr: 0,
                        permanentAddressZipcodeStr: 0,
                        phoneNumberStr: 0,
                        alternatePhoneNumberStr: 0
                    }
                }
            ])


            if (dbCandidates && dbCandidates.length > 0) {
                const resumeFilter = {
                    keywordMandatoryBadges, keywordOptionalBadges, keywordBoolean, companyMandatoryBadges, companyOptionalBadges, companyBoolean,
                    designationMandatoryBadges, designationOptionalBadges, designationBoolean, cities, regions, skillsKeywords
                }

                const matchedCandidates = [];

                for (const candidate of dbCandidates) {
                    if (!candidate.resumeLink) continue;

                    const resumeText = await extractTextFromResume(candidate.resumeLink);
                    if (!resumeText) continue;

                    const lowerText = resumeText.toLowerCase();
                    const hasKeyword = resumeMatches(lowerText, resumeFilter)

                    if (hasKeyword) {
                        if (remainingCandidateCount > 0) {
                            matchedCandidates.push(candidate);
                            remainingCandidateCount -= 1;           // ✅ decrement so you don't overfill
                            if (remainingCandidateCount === 0) break;
                        } else {
                            break;
                        }
                    }

                }

                filteredCandidates.push(...matchedCandidates)
            }
        }

        return res.status(200).json({ success: true, message: "Successfully filtered!", candidates: filteredCandidates, totalPages: Math.ceil(totalCandidates / limit), totalCandidates: totalCandidates, pipeline: pipeline })

    }
    catch (err) {
        console.log("Error in advanced filter:", err)
        return res.status(500).json({ success: false, message: "Trouble in advance filter functionality! please contact support team." })
    }
})

module.exports = router