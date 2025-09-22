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


summaryRouter.get('/fetch-information',  async (req,res)=>{
    try{
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
        const canidateInformation = await candidate.findOne({"user.id" : userId.id})
        if (canidateInformation){
            return res.json({ success: true, canidateInformation })
        }
        else{
            return res.json({success : false , message : "Candidate not fount please try again later!"})
        }

    }
    catch (err) {
        console.log("Error in /perferredinfromation route", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving preferred information" });
    }
})

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
