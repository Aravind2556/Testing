const express = require("express");
const summeryValidator = require('../utils/validator/summeryValidator')
const summaryRouter = express.Router();
const candidate = require('../models/Candidate');
const isAuth = require("../middleware/isAuth");
const userModel = require("../models/User")
const validatePreferredJobForm = require('../utils/validator/preferredValidator')

// 🔹 Route to handle summary information submission Completed
summaryRouter.post("/summerinfromation",isAuth, async (req, res) => {
    try {
        const { profileSummary, address } = req.body;
        console.log("profileSummary, address", profileSummary, address)
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        // 🔹 Role check
        if (req.session.user.role !== "job-seeker"){
            return res.status(403).json({ success: false, message: "Access denied: Only job-seeker allowed" });
        }
        // 🔹 DB check
        const userId = await userModel.findOne({ id: req.session.user.id });
        if (!userId) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const existingCandidate = await candidate.findOne({ user : userId})
        if (!existingCandidate) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
        }          
        if (!profileSummary || !address) {
            return res.json({ success: false, message: "All fields are required" });
        }
        // 🔹 Profile summary validation
        if (profileSummary.trim().length < 3) {
            return res.json({success: false,message: "Profile summary must be at least 10 characters"});
        }
        if (!address.present) {
            return res.json({ success: false,message: "Present address is required"});
        }
        // 🔹 Validate present address
        let presentErrors = summeryValidator(address.present);
        if (Object.keys(presentErrors).length > 0) {
            return res.json({ success: false, message: "Present address validation failed"});
        }
        // 🔹 If sameAsPresent = true → auto copy present to permanent
        if (address.sameAsPresent) {
            address.permanent = { ...address.present };
        } else {
            // 🔹 If false → validate permanent address separately
            if (!address.permanent) {
                return res.json({success: false, message: "Permanent address is required"});
            }
            let permanentErrors = summeryValidator(address.permanent);
            if (Object.keys(permanentErrors).length > 0) {
                return res.json({success: false,message: "Permanent address validation failed",errors: permanentErrors});
            }
        }
        if (existingCandidate) {
            // 🔹 Update existing candidate
            existingCandidate.profileSummary = profileSummary;
            existingCandidate.isSummeryInfromation = true
            existingCandidate.sameasPresentAddress = address.sameAsPresent
            existingCandidate.presentAddress = address.present;
            existingCandidate.permanentAddress = address.sameAsPresent     
                ? { ...address.present }
                : address.permanent;

            await existingCandidate.save();
            console.log("Candidate info updated successfully", existingCandidate);

            return res.json({ success: true, message: "Candidate info updated successfully", data: existingCandidate});
        }

    } catch (err) {
        console.log("error", err);
        return res.json({
            success: false,
            message: "Error in summary information",
        });
    }
});

summaryRouter.post('/candidate-skills' ,isAuth, async (req,res) => {
    try{
        const { skills , type} = req.body
        console.log("skills", skills, type)
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        // 🔹 Role check
        if (req.session.user.role !== "job-seeker") {
            return res.status(403).json({ success: false, message: "Access denied: Only job-seeker allowed" });
        }
        // 🔹 DB check
        const userId = await userModel.findOne({ id: req.session.user.id });
        if (!userId) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const existingCandidate = await candidate.findOne({ user: userId })
        if (!existingCandidate) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
        } 
        if (type === "primarySkills") {
            if (skills && skills.length > 0) {
                // Normalize skills to include experience properly
                const formattedSkills = skills.map((s) => ({
                    id : s.id,
                    primarySkill: s.primarySkill.trim().toLowerCase(),
                    experience: Array.isArray(s.experience)
                        ? s.experience[0]
                        : s.experience || { month: 0, year: 0 },
                    lastUsed: s.lastUsed || "",
                    version: s.version || "",
                }));

                // Remove duplicates by primarySkill
                const existingSkillNames = existingCandidate.primarySkills
                    .map((s) => s.primarySkill.trim().toLowerCase());
                const merged = [...existingSkillNames, ...formattedSkills.map(f => f.primarySkill)];
                const uniqueSkillNames = [...new Set(merged)];

                const uniqueFormattedSkills = uniqueSkillNames.map(name => {
                    const skill = formattedSkills.find(f => f.primarySkill === name)
                        || existingCandidate.primarySkills.find(e => e.primarySkill === name);
                    return skill;
                });

                existingCandidate.primarySkills = uniqueFormattedSkills;
                existingCandidate.skills = uniqueFormattedSkills;

                await existingCandidate.save();
                return res.status(200).json({
                    success: true,
                    message: "Primary skills saved successfully",
                    data: existingCandidate.primarySkills
                });
            }
        }

        else{
            return res.status(400).json({ success: false, message: "Invalid type specified" });
        }


        

    }
    catch (err) {
        console.log("Error in Candidate skills", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving candidate skills" });        
    }
})

// candidate experience route Completed
summaryRouter.post('/candidate-experience', isAuth, async (req, res) => {
    try {
        const { experience, type ,id } = req.body;
        console.log("experience", experience, type , id);
        
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        // Role check
        if (req.session.user.role !== "job-seeker") {
            return res.status(403).json({ success: false, message: "Access denied: Only job-seeker allowed" });
        }

        // DB check
        const userId = await userModel.findOne({ id: req.session.user.id });
        if (!userId) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const existingCandidate = await candidate.findOne({ user: userId });
        if (!existingCandidate) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
        }

        if (type === "create") {
            if (experience && experience.length > 0) {
                const formatExperience = [];

                for (const exp of experience) {
                    // 🔹 Validation check
                    if (!exp.jobTitle || !exp.employer || !exp.periodFrom[0] || !exp.employmentType || !exp.industryType || !exp.noticePeriod) {
                        return res.json({ success: false, message: "All mandatory fields are required!" });
                    }

                    // 🔹 Format periodFrom
                    const yearFrom = exp.periodFrom[0];
                    const monthFrom = exp.periodFrom[1] || "01";
                    const dayFrom = exp.periodFrom[2] || "01";
                    const periodFrom = new Date(`${yearFrom}-${monthFrom.padStart(2, "0")}-${dayFrom.padStart(2, "0")}`);

                    let periodTo = null;
                    if (exp.isOngoing === false) {
                        if (!exp.periodTo[0]) {
                            return res.json({ success: false, message: "Period To is required if not ongoing!" });
                        }
                        const yearTo = exp.periodTo[0];
                        const monthTo = exp.periodTo[1] || "01";
                        const dayTo = exp.periodTo[2] || "01";
                        periodTo = new Date(`${yearTo}-${monthTo.padStart(2, "0")}-${dayTo.padStart(2, "0")}`);
                    }

                    formatExperience.push({
                        jobTitle: exp.jobTitle.trim().toLowerCase(),
                        employer: exp.employer.trim().toLowerCase(),
                        employmentType: exp.employmentType.trim().toLowerCase(),
                        industryType: exp.industryType.trim().toLowerCase(),
                        noticePeriod: exp.noticePeriod.trim().toLowerCase(),

                        isOngoing: exp.isOngoing,
                        location: exp.location || "",
                        city: exp.city || "",
                        state: exp.state || "",
                        country: exp.country || "",
                        description: exp.description || "",
                        isFresher: exp.isFresher || false,
                    });
                }

                //DB save logic (spread operator so array not nested)
                existingCandidate.experiences.push(...formatExperience);
                await existingCandidate.save();

                return res.json({ success: true, message: "Experience saved successfully" });
            } else {
                return res.json({ success: false, message: "Experience data is required!" });
            }
        } else if (type === "update") {
            if (!id) {
                return res.send({ success: false, message: "Updated id is required! Contact admin." });
            }

            if (experience && experience.length > 0) {
                const expToUpdate = existingCandidate.experiences.id(id); // Mongoose subdocument find
                if (!expToUpdate) {
                    return res.status(404).json({ success: false, message: "Experience not found" });
                }

                const exp = experience[0]; // Assuming only 1 object sent for update

                // Validation check
                if (!exp.jobTitle || !exp.employer || !exp.periodFrom[0] || !exp.employmentType || !exp.industryType || !exp.noticePeriod) {
                    return res.json({ success: false, message: "All mandatory fields are required!" });
                }

                // Format dates
                // const periodFrom = new Date(`${exp.periodFrom[0]}-${(exp.periodFrom[1] || "01").padStart(2, "0")}-${(exp.periodFrom[2] || "01").padStart(2, "0")}`);
                // let periodTo = null;
                // if (!exp.isOngoing) {
                //     periodTo = new Date(`${exp.periodTo[0]}-${(exp.periodTo[1] || "01").padStart(2, "0")}-${(exp.periodTo[2] || "01").padStart(2, "0")}`);
             

                // Update fields
                expToUpdate.jobTitle = exp.jobTitle.trim().toLowerCase();
                expToUpdate.employer = exp.employer.trim().toLowerCase();
                expToUpdate.employmentType = exp.employmentType.trim().toLowerCase();
                expToUpdate.industryType = exp.industryType.trim().toLowerCase();
                expToUpdate.noticePeriod = exp.noticePeriod.trim().toLowerCase();
                // expToUpdate.periodFrom = periodFrom;
                // expToUpdate.periodTo = periodTo;
                expToUpdate.isOngoing = exp.isOngoing;
                expToUpdate.location = exp.location || "";
                expToUpdate.city = exp.city || "";
                expToUpdate.state = exp.state || "";
                expToUpdate.country = exp.country || "";
                expToUpdate.description = exp.description || "";
                expToUpdate.isFresher = exp.isFresher || false;

                await existingCandidate.save();
                return res.json({ success: true, message: "Experience updated successfully" });
            }
        }else{
            return res.send({success : false , message : "not ok clear"})
        }    
    } catch (err) {
        console.log("Error in Candidate experience", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving candidate experience" });
    }
});






summaryRouter.post('/educationinformation',isAuth , async (req,res)=>{
    try{
        const { profileSummary, address } = req.body;
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        // 🔹 Role check
        if (req.session.user.role !== "job-seeker") {
            return res.status(403).json({ success: false, message: "Access denied: Only job-seeker allowed" });
        }
        // 🔹 DB check
        const userId = await userModel.findOne({ id: req.session.user.id });
        if (!userId) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const existingCandidate = await candidate.findOne({ "user.id": userId })
        if (!existingCandidate) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
        } 

    }
    catch(err){
        console.log("error", err);
        return res.json({
            success: false,
            message: "Error in summary information",
        });
    }
})

// summaryRouter.post('/perferredinfromation',isAuth,async (req,res)=>{
//     try{ 
//         const {formData }=req.body
//         console.log("perferredinfromation", BeURL, formData)
//         if (!req.session || !req.session.user) {
//             return res.status(401).json({ success: false, message: "Unauthorized" });
//         }
//         // 🔹 Role check
//         if (req.session.user.role !== "job-seeker") {
//             return res.status(403).json({ success: false, message: "Access denied: Only job-seeker allowed" });
//         }
//         // 🔹 DB check
//         const userId = await userModel.findOne({ id: req.session.user.id });
//         if (!userId) {
//             return res.status(404).json({ success: false, message: "User not found" });
//         }
//         // const existingCandidate = await candidate.findOne({ "user.id": userId })
//         // if (!existingCandidate) {
//         //     return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
//         // } 
//         if (!formData){
//             return res.json({ success: false, message: "All fields are required" });
//         }




//     }
//     catch(err){
//         console.log("error", err);
//         return res.json({
//             success: false,
//             message: "Error in summary information",
//         });
//     }
// })




summaryRouter.post('/perferredinfromation', isAuth, async (req, res) => {
    try {
        const { formData } = req.body;
        console.log("formdata",formData)
        //Session check
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        //Role check
        if (req.session.user.role !== "job-seeker") {
            return res.status(403).json({ success: false, message: "Access denied: Only job-seeker allowed" });
        }
        //User existence check
        const userId = await userModel.findOne({ id: req.session.user.id });
        if (!userId) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        //Validate formData
        if (!formData || Object.keys(formData).length === 0) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }
        const errors = validatePreferredJobForm(formData);
        if (Object.keys(errors).length > 0) {
            return res.status(400).json({ success: false, message: "Validation failed", errors });
        }
        //Candidate existence check
        const candidateData = await candidate.findOne({ "user.id": userId });
        if (!candidateData) {
            return res.status(400).json({success: false,message: "Candidate profile does not exist. Please complete your profile first."});
        }

        //Save or Update Candidate Preferences
        candidateData.preferredJob = formData.preferredJobRole;
        candidateData.preferredLocation = formData.preferredJobLocations;
        candidateData.employmentType = formData.employmentType;
        candidateData.preferredWorkMode = formData.preferredWorkMode;
        candidateData.currentCTC.amount = formData.currentCTC;
        candidateData.expectedCTC.amount = formData.expectedCTC;
        candidateData.noticePeriod = formData.noticePeriod;
        candidateData.negotiableNoticePeriod = formData.negotiableNoticePeriod;
        candidateData.isPreferredInformation = true; 

        await candidateData.save();

        return res.json({success: true,message: "Preferences saved successfully", data: formData });

    } catch (err) {
        console.log("Error in /perferredinfromation route",err);
        return res.status(500).json({ success: false,message: "Internal server error while saving preferred information"});
    }
});


summaryRouter.get('/fetch-information', async (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        // 🔹 Role check
        if (req.session.user.role !== "job-seeker") {
            return res.status(403).json({ success: false, message: "Access denied: Only job-seeker allowed" });
        }

        // 🔹 User existence check
        const userId = await userModel.findOne({ id: req.session.user.id });
        if (!userId) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // 🔹 Candidate existence check
        const candidateInformation = await candidate
            .findOne({ user: userId._id })
            .populate('user', '-password -__v -_id');

        if (!candidateInformation) {
            return res.json({ success: false, message: "Candidate not found. Please try again later!" });
        }

        // 🔹 Extract information safely
        const candidateExperience = candidateInformation.experiences || [];
        const candidateEducation = candidateInformation.educations || [];
        const candidateSkills = candidateInformation.skills || [];
        const candidatePrimarySkills = candidateInformation.primarySkills || [];

        return res.json({
            success: true,
            candidateInformation,
            candidateExperience,
            candidateEducation,
            candidateSkills,
            candidatePrimarySkills
        });

    } catch (err) {
        console.log("Error in /fetch-information route", err);
        return res.status(500).json({ success: false, message: "Internal server error while fetching candidate information" });
    }
});


summaryRouter.post('/personalInfromation', async (req, res) => {
    try {
        const { profile, profileInformation, language, disability } = req.body; // use the whole body directly
        console.log("personalDetail", profile, profileInformation, language, disability);
        return res.json({ success: true, message: "Personal info received"});
    } catch (err) {
        console.log("Error in /personalInfromation route", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving personal information" });
    }
});


summaryRouter.post('/education' , async (req,res) =>{
    try{
        const { education } = req.body
        console.log("education",education)

        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        // 🔹 Role check
        if (req.session.user.role !== "job-seeker") {
            return res.status(403).json({ success: false, message: "Access denied: Only job-seeker allowed" });
        }
        // 🔹 DB check
        const userId = await userModel.findOne({ id: req.session.user.id });
        if (!userId) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const existingCandidate = await candidate.findOne({ "user.id": userId.id })
        if (!existingCandidate) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
        } 
        
        // 🔹 Mandatory fields validation
        for (let i = 0; i < education.length; i++) {
            const edu = education[i];
            if (
                !edu.institutionName ||
                !edu.courseCategory ||
                !edu.courseType ||
                !edu.courseName ||
                !edu.gradeType ||
                !edu.gradeValue ||
                !edu.industryType ||
                !edu.periodFromYear ||
                (!edu.isOngoing && !edu.periodToYear)
            ) {
                return res.status(400).json({
                    success: false,
                    message: `Education entry ${i + 1} is missing mandatory fields.`
                });
            }
        }

        // 🔹 Save education to candidate
        existingCandidate.education = education;
        await existingCandidate.save();

        return res.status(200).json({ success: true, message: "Education saved successfully." });

    }
    catch (err) {
        console.log("Error in /personalInfromation route", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving personal information" });
    }
})




module.exports = summaryRouter;
