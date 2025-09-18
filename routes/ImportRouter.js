const Express = require('express')
const multer = require('multer');
const XLSX = require('xlsx');
const Candidate = require('../models/Candidate');

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(xls|xlsx)$/)) {
            return cb(new Error('Only Excel files are allowed!'), false);
        }
        cb(null, true);
    }
});

const ImportRouter = Express.Router()

ImportRouter.post('/import-candidate-info', upload.single('file'), async (req, res) => {

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const sendResponse = data => {
        res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const dataValidation = data => {
        if (!data || data.trim() === "" || data.trim().toLowerCase() === "n/a")
            return false
        else
            return true
    }

    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const shortMonths = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const fetchMonthIndex = month => {
        const monthIndex = shortMonths.findIndex(item => item.toLowerCase() === month.toLowerCase())
        if (monthIndex === -1) return false
        else if (typeof monthIndex === "number") return monthIndex
        else return false
    }

    const fetchDate = (date, sheet) => {
        if (date) {
            if (date.includes("/")) {
                const experienceDate = date.split("/")
                const experienceDay = parseInt(experienceDate[0], 10)

                let experienceMonth
                if (sheet === 'edu')
                    experienceMonth = fetchMonthIndex(experienceDate[1])
                else if (sheet === 'exp')
                    experienceMonth = parseInt(experienceDate[1], 10) - 1

                const experienceYear = parseInt(experienceDate[2], 10)

                if (experienceDay && (experienceMonth || experienceMonth === 0) && experienceYear && typeof experienceDay === "number" && typeof experienceMonth === "number" && typeof experienceYear === "number") {
                    return new Date(experienceYear, experienceMonth, experienceDay)
                }
                else return false
            }
            else return false
        }
        else return false
    }

    try {
        if (!req.file) {
            sendResponse({ error: 'No file uploaded', progress: 0 });
            return res.end();
        }

        // Read workbook data
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const eduRows = XLSX.utils.sheet_to_json(wb.Sheets['Education Details'], { defval: '' });
        const workRows = XLSX.utils.sheet_to_json(wb.Sheets['Work Experience'], { defval: '' });

        // Progress percentage calculation
        const totalRows = eduRows.length + workRows.length
        let processed = 0
        let pct = Math.floor((processed / totalRows) * 100)

        let emptyRow = 0


        // Education Details sheet - Row Iteration
        for (let i = 0; i < eduRows.length; i++) {

            processed++
            pct = Math.floor((processed / totalRows) * 100)

            if (i === 0) {
                sendResponse({ message: "Started processing with the Education Details sheet..." })

                // resetting emptyRow count
                emptyRow = 0
            }

            const row = eduRows[i];

            if (!row) {
                sendResponse({ message: `Education Details sheet: Row ${i} is empty!` })

                emptyRow++

                if (emptyRow > 5)
                    break

                continue
            }

            if (!row['Applicant Id']) {
                sendResponse({ message: `Education Details sheet: Applicant Id is not available in ${i} row!` })
                continue
            }

            const id = parseInt(row['Applicant Id'], 10)
            if (!id) {
                sendResponse({ message: `Education Details sheet: Applicant Id data is not found in ${i} row!` })
                continue
            }

            const fetchCandidate = await Candidate.findOne({ applicantID: id })
            if (!fetchCandidate) {
                sendResponse({ message: `Education Details sheet: Candidate with ID ${id} is not found in database!` })
                continue
            }

            let educations = {}
            let experiences = {}


            if (row['Degree'] && (row['Degree']?.toLowerCase() === "n/a")) {
                if (dataValidation(row["School Name"])) {
                    educations.institutionName = row["School Name"]
                }

                if (dataValidation(row["Year Completed"]) && row["Year Completed"].includes("-")) {

                    const completionDate = row["Year Completed"].split("-")
                    const completionMonth = completionDate[0]
                    const completionYear = parseInt(completionDate[1], 10)

                    if (completionMonth && completionYear && typeof completionYear === "number") {
                        const monthIndex = months.findIndex(item => item.toLowerCase() === completionMonth.toLowerCase())
                        if (monthIndex !== -1) {
                            // educations.courseCompletion = {
                            //     month: monthIndex + 1,
                            //     year: completionYear
                            // }
                            educations.endDate = new Date(completionYear, monthIndex, 1)
                        }
                    }

                }

                if (dataValidation(row["Major Study"])) {
                    let tempCourseName = row["Major Study"]
                    if (dataValidation(row["Minor Study"])) {
                        tempCourseName = `${tempCourseName}, ${row["Minor Study"]}`
                    }
                    educations.courseName = tempCourseName
                }

                if (dataValidation(row["Country"])) {
                    educations.country = row["Country"]
                }

                if (dataValidation(row["State"])) {
                    educations.state = row["State"]
                }

                if (dataValidation(row["City"])) {
                    educations.city = row["City"]
                }

                if (fetchCandidate?.educations?.length > 0 && Array.isArray(fetchCandidate.educations)) {
                    const searchEducations = (fetchCandidate.educations).some(item => {
                        if (item?.institutionName === educations?.institutionName) {
                            if ((item?.courseCategory?.month === educations?.courseCategory?.month) && (item?.courseCategory?.year === educations?.courseCategory?.year) && (item?.courseName === educations?.courseName)) {
                                return true
                            }
                            else false
                        }
                        else return false
                    })
                    if (searchEducations) {
                        sendResponse({ message: `Education Details sheet: Skipping row! Same education already exists for candidate ID ${id}` })
                        continue
                    }
                }

                if (educations && Object.entries(educations).length > 0) {
                    const updateCandidate = await Candidate.updateOne({ applicantID: id }, { $push: { educations } })
                    if (updateCandidate.modifiedCount > 0 && updateCandidate.matchedCount > 0) {
                        sendResponse({ message: `Education Details sheet: Successfully updated education details for candidate ID ${id}`, progress: pct })
                    }
                    else {
                        sendResponse({ message: `Education Details sheet: Failed to update education details for candidate ID ${id}`, progress: pct })
                    }
                }
            }
            else {
                if (dataValidation(row["School Name"])) {
                    experiences.jobTitle = row["School Name"]
                }

                if (dataValidation(row["Degree"])) {
                    experiences.employer = row["Degree"]
                }

                if (dataValidation(row["Year Completed"]) && row["Year Completed"].includes(" to ")) {
                    const experienceDate = row["Year Completed"].split(" to ")
                    const experienceFrom = experienceDate[0]
                    const experienceTo = experienceDate[1]

                    if (experienceFrom && experienceTo) {
                        if (experienceFrom.includes("/")) {
                            const experienceFromDate = fetchDate(experienceFrom, 'edu')
                            if (experienceFromDate) {
                                experiences.periodFrom = experienceFromDate
                            }
                        }

                        if (experienceTo.includes("/")) {
                            const experienceToDate = fetchDate(experienceTo, 'edu')
                            if (experienceToDate) {
                                experiences.periodTo = experienceToDate
                            }
                        }
                        else if (experienceTo.trim().toLowerCase() === "till date") {
                            if (fetchCandidate?.experiences && Array.isArray(fetchCandidate.experiences) && fetchCandidate.experiences.length === 1) {
                                const searchExperiences = (fetchCandidate.experiences).some(item => {
                                    if (item.isOngoing && (item.jobTitle || item.employer) && !item.periodFrom && !item.periodTo) {
                                        return true
                                    }
                                    else return false
                                })
                                if (searchExperiences) {
                                    sendResponse({ message: `Education Details sheet: Found Dummy Data for candidate ID ${id}` })
                                    const deleteDummyExperience = await Candidate.updateOne({ applicantID: id }, { $set: { experiences: [] } })
                                    if (deleteDummyExperience.matchedCount > 0 && deleteDummyExperience.modifiedCount > 0) {
                                        sendResponse({ message: `Education Details sheet: Successfully deleted dummy experience details for candidate ID ${id}` })
                                    }
                                    else {
                                        sendResponse({ message: `Education Details sheet: Failed to deleted dummy experience details for candidate ID ${id}` })
                                    }
                                }
                            }
                            experiences.isOngoing = true
                        }
                    }
                }

                const getCandidate = await Candidate.findOne({ applicantID: id })
                if (getCandidate?.experiences?.length > 0 && Array.isArray(getCandidate.experiences)) {
                    const searchExperiences = (getCandidate.experiences).some(item => {
                        if (item?.employer === experiences?.employer) {
                            if (item?.periodFrom?.getTime() === experiences?.periodFrom?.getTime()) {
                                return true
                            }
                            else if (item?.periodTo?.getTime() === experiences?.periodTo?.getTime()) {
                                return true
                            }
                            else if ((item.isOngoing || item.isOngoing === false) && (experiences.isOngoing || experiences.isOngoing === false) && (item.isOngoing === experiences.isOngoing))
                                return true
                            else false
                        }
                        else return false
                    })
                    if (searchExperiences) {
                        sendResponse({ message: `Education Details sheet: Skipping row! Same experience already exists for candidate ID ${id}` })
                        continue
                    }
                }

                if (experiences && Object.entries(experiences).length > 0) {
                    const updateCandidate = await Candidate.updateOne({ applicantID: id }, { $push: { experiences } })
                    if (updateCandidate.matchedCount > 0 && updateCandidate.modifiedCount > 0) {
                        sendResponse({ message: `Education Details sheet: Successfully updated experience details for candidate ID ${id}`, progress: pct })
                    }
                    else {
                        sendResponse({ message: `Education Details sheet: Failed to update experience details for candidate ID ${id}`, progress: pct })
                    }
                }

            }

        }

        // Work Experience sheet - Row Iteration
        for (let i = 0; i < workRows.length; i++) {
            processed++
            pct = Math.floor((processed / totalRows) * 100)
            if (i === 0) {
                sendResponse({ message: "Started with the Experience Details sheet processing...", progress: pct })

                // resetting emptyRow count
                emptyRow = 0
            }

            const row = workRows[i];

            if (!row) {
                sendResponse({ message: `Experience Details sheet: Row ${i} is empty!` })
                emptyRow++
                if (emptyRow > 5)
                    break
                continue
            }

            if (!row['Applicant Id']) {
                sendResponse({ message: `Experience Details sheet: Applicant Id is not available in ${i} row!` })
                continue
            }
            const id = parseInt(row['Applicant Id'], 10)
            if (!id) {
                sendResponse({ message: `Experience Details sheet: Applicant Id data is not found in ${i} row!` })
                continue
            }

            const fetchCandidate = await Candidate.findOne({ applicantID: id })
            if (!fetchCandidate) {
                sendResponse({ message: `Experience Details sheet: Candidate with ID ${id} is not found in database!` })
                continue
            }

            let experiences = {}

            if (dataValidation(row["Job Title"])) {
                experiences.jobTitle = row["Job Title"]
            }

            if (dataValidation(row["Employer"])) {
                experiences.employer = row["Employer"]
            }

            if (dataValidation(row["Period"]) && row["Period"].includes(" to ")) {
                const experienceDate = row["Period"].split(" to ")
                const experienceFrom = experienceDate[0]
                const experienceTo = experienceDate[1]

                if (experienceFrom && experienceTo) {
                    if (experienceFrom.includes("/")) {
                        const experienceFromDate = fetchDate(experienceFrom, 'exp')
                        if (experienceFromDate) {
                            experiences.periodFrom = experienceFromDate
                        }
                    }

                    if (experienceTo.includes("/")) {
                        const experienceToDate = fetchDate(experienceTo, 'exp')
                        if (experienceToDate) {
                            experiences.periodTo = experienceToDate
                        }
                    }
                    else if (experienceTo.trim().toLowerCase() === "till date") {
                        if (fetchCandidate && fetchCandidate.experiences && Array.isArray(fetchCandidate.experiences) && fetchCandidate.experiences.length === 1) {
                            const findExperiences = (fetchCandidate.experiences).some(item => {
                                if (item.isOngoing && (item.jobTitle || item.employer) && !item.periodFrom && !item.periodTo) {
                                    return true
                                }
                                else return false
                            })
                            if (findExperiences) {
                                sendResponse({ message: `Experience Details sheet: Found Dummy Data for candidate ID ${id}` })
                                const deleteDummyExperience = await Candidate.updateOne({ applicantID: id }, { $set: { experiences: [] } })
                                if (deleteDummyExperience.matchedCount > 0 && deleteDummyExperience.modifiedCount > 0) {
                                    sendResponse({ message: `Experience Details sheet: Successfully deleted dummy experience details for candidate ID ${id}` })
                                }
                                else {
                                    sendResponse({ message: `Experience Details sheet: Failed to deleted dummy experience details for candidate ID ${id}` })
                                }
                            }
                        }
                        experiences.isOngoing = true
                    }
                }
            }

            const findCandidate = await Candidate.findOne({ applicantID: id })
            if (findCandidate?.experiences?.length > 0 && Array.isArray(findCandidate.experiences)) {
                const findExperiences = (findCandidate.experiences).some(item => {
                    if (item?.employer === experiences?.employer) {
                        if (item?.periodFrom?.getTime() === experiences?.periodFrom?.getTime()) {
                            return true
                        }
                        else if (item?.periodTo?.getTime() === experiences?.periodTo?.getTime()) {
                            return true
                        }
                        else if ((item.isOngoing || item.isOngoing === false) && (experiences.isOngoing || experiences.isOngoing === false) && (item.isOngoing === experiences.isOngoing))
                            return true
                        else false
                    }
                    else return false
                })
                if (findExperiences) {
                    sendResponse({ message: `Education Details sheet: Skipping row! Same experience already exists for candidate ID ${id}` })
                    continue
                }
            }
            if (experiences && Object.entries(experiences).length > 0) {
                const updateCandidate = await Candidate.updateOne({ applicantID: id }, { $push: { experiences } })
                if (updateCandidate.matchedCount > 0 && updateCandidate.modifiedCount > 0) {
                    sendResponse({ message: `Experience Details sheet: Successfully updated experience details for candidate ID ${id}`, progress: pct })
                }
                else {
                    sendResponse({ message: `Experience Details sheet: Failed to update experience details for candidate ID ${id}`, progress: pct })
                }
            }
        }

        sendResponse({ message: "Successfully imported candidate info!", progress: pct })
        res.end();
    }
    catch (err) {
        console.log("Error in importing candidate info:", err)
        res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
    }
})

module.exports = ImportRouter