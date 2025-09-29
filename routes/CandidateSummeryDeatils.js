const express = require("express");
const summeryValidator = require('../utils/validator/summeryValidator')
const summaryRouter = express.Router();
const candidate = require('../models/Candidate');
const isAuth = require("../middleware/isAuth");
const userModel = require("../models/User")
const validatePreferredJobForm = require('../utils/validator/preferredValidator')
const Skill = require('../models/Skills')

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

// candidate experience route Completed
summaryRouter.post('/candidate-experience', isAuth, async (req, res) => {
    try {
        const { experience, type  } = req.body;
        console.log("experience", experience, type);
        
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
                        periodTo : periodTo ,
                        periodFrom : periodFrom ,
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
             

                // Update fields
                expToUpdate.jobTitle = exp.jobTitle.trim().toLowerCase();
                expToUpdate.employer = exp.employer.trim().toLowerCase();
                expToUpdate.employmentType = exp.employmentType.trim().toLowerCase();
                expToUpdate.industryType = exp.industryType.trim().toLowerCase();
                expToUpdate.noticePeriod = exp.noticePeriod.trim().toLowerCase();
                expToUpdate.periodFrom = periodFrom;
                expToUpdate.periodTo = periodTo;
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

// candidate experience update completed
summaryRouter.put('/candidate-experience/:id',isAuth ,async (req,res) => {
    try{
        const {id} = req.params
        const { experience } = req.body;
        console.log("experience", experience, id);
        if(!id || !experience){
           return res.send({success : false , message : "All field are required pleade try agin later"})
        }
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
            // Update fields
            expToUpdate.jobTitle = exp.jobTitle.trim().toLowerCase();
            expToUpdate.employer = exp.employer.trim().toLowerCase();
            expToUpdate.employmentType = exp.employmentType.trim().toLowerCase();
            expToUpdate.industryType = exp.industryType.trim().toLowerCase();
            expToUpdate.noticePeriod = exp.noticePeriod.trim().toLowerCase();
            expToUpdate.periodFrom = periodFrom;
            expToUpdate.periodTo = periodTo;
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
        else{
            return res.json({success : false , message : "Experience are required please try gain later!"})
        }
    }
    catch (err) {
        console.log("Error in Candidate experience", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving candidate experience" });
    }
})

// candidate experience delete  completed
summaryRouter.delete('/candidate-experience-delete/:id', isAuth, async (req,res) => {
    try{
        const {id}=req.params
        if(!id){
            return res.send({success : false , message : ""})
        }
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
        // ---------- DELETE EXPERIENCE ----------
        const expIndex = existingCandidate.experiences.findIndex(exp => exp._id.toString() === id);
        if (expIndex === -1) {
            return res.status(404).json({ success: false, message: "Experience not found" });
        }

        existingCandidate.experiences.splice(expIndex, 1); // remove experience
        const deleteExperiences = await existingCandidate.save();
        if (!deleteExperiences){
            return res.status(200).json({ success: true, message: "Faild to delete experience please try agin later!" });
        }
        else{
            return res.status(200).json({ success: true, message: "Experience deleted successfully!" });
        }
    }
    catch (err) {
        console.log("Error in Candidate experience", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving candidate experience" });
    }
})

// candidate perferrence completed
summaryRouter.post('/perferredinfromation', isAuth, async (req, res) => {
    try {
        const { formData } = req.body;
        console.log("formdata", formData)
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
        //Candidate existence check
        const candidateData = await candidate.findOne({ user : userId });
        if (!candidateData) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
        }
        //Validate formData
        if (!formData || Object.keys(formData).length === 0) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }
        const errors = validatePreferredJobForm(formData);
        if (Object.keys(errors).length > 0) {
            return res.status(400).json({ success: false, message: "Validation failed", errors });
        }

        //Save or Update Candidate Preferences
        candidateData.preferredJob = formData.preferredJobRole || "";
        candidateData.preferredLocation = formData.preferredJobLocations || "";
        candidateData.employmentType = formData.employmentType || "";
        candidateData.preferredWorkMode = formData.preferredWorkMode || "";
        candidateData.currentCTC.amount = formData.currentCTC || "";
        candidateData.expectedCTC.amount = formData.expectedCTC || "";
        candidateData.noticePeriod = formData.noticePeriod || "";
        candidateData.negotiableNoticePeriod = formData.negotiableNoticePeriod || "";
        candidateData.isPreferredInformation = true;

        await candidateData.save();

        return res.json({ success: true, message: "Preferences saved successfully", data: formData });

    } catch (err) {
        console.log("Error in /perferredinfromation route", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving preferred information" });
    }
});

// candidate create certificate 
summaryRouter.post('/candidate-certificate', isAuth , async (req,res) => {
    try{
        const {certifications} = req.body
        console.log("certifications", certifications)
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
        //Candidate existence check
        const candidateData = await candidate.findOne({ user: userId });
        if (!candidateData) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
        }
        if (certifications && certifications.length > 0){
            const formatCertifications = [];
            for (const certificate of certifications){
                // 🔹 Validation check
                if (!certificate.certificationName || !certificate.organization || !certificate.periodFrom[0] || !certificate.mode) {
                    return res.json({ success: false, message: "All mandatory fields are required!"});
                }
                // 🔹 Format periodFrom
                const yearFrom = certificate.periodFrom[0];
                const monthFrom = certificate.periodFrom[1] || "01";
                const dayFrom = certificate.periodFrom[2] || "01";
                const periodFrom = new Date(`${yearFrom}-${monthFrom.padStart(2, "0")}-${dayFrom.padStart(2, "0")}`);

                let periodTo = null;
                if (certificate.isProcessing === false) {
                    if (!certificate.periodTo[0]) {
                        return res.json({ success: false, message: "Period To is required if not ongoing!" });
                    }
                    const yearTo = certificate.periodTo[0];
                    const monthTo = certificate.periodTo[1] || "01";
                    const dayTo = certificate.periodTo[2] || "01";
                    periodTo = new Date(`${yearTo}-${monthTo.padStart(2, "0")}-${dayTo.padStart(2, "0")}`);
                }

                formatCertifications.push({
                    certificationName: certificate.certificationName.trim().toLowerCase(),
                    organization: certificate.organization.trim().toLowerCase(),
                    mode: certificate.mode.trim().toLowerCase(),
                    periodTo: periodTo,
                    periodFrom: periodFrom,
                    isProcessing: certificate.isProcessing,                 
                    description: certificate.description || "",                    
                });
            }
            //DB save logic (spread operator so array not nested)
            candidateData.certifications.push(...formatCertifications);
            await candidateData.save();

            return res.json({ success: true, message: "Certificate saved successfully"});
        }     
    }
    catch (err) {
        console.log("Error in /candidate-certificate route", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving candidate certificate" });
    }
})

// candidate experience update completed
summaryRouter.put('/candidate-certificate/:id', isAuth, async (req, res) => {
    try {
        const { id } = req.params
        const { certifications } = req.body;
        console.log("certifications", certifications , id);
        if (!id || !certifications) {
            return res.send({ success: false, message: "All field are required pleade try agin later" })
        }
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

        if (certifications && certifications.length > 0) {
            const expToUpdate = existingCandidate.certifications.id(id); // Mongoose subdocument find
            if (!expToUpdate) {
                return res.status(404).json({ success: false, message: "Certificate not found" });
            }

            const exp = certifications[0]; // Assuming only 1 object sent for update

            // Validation check
            if (!exp.certificationName || !exp.organization || !exp.mode) {
                return res.json({ success: false, message: "All mandatory fields are required!" });
            }

            // 🔹 Format periodFrom
            const yearFrom = exp.periodFrom[0];
            const monthFrom = exp.periodFrom[1] || "01";
            const dayFrom = exp.periodFrom[2] || "01";
            const periodFrom = new Date(`${yearFrom}-${monthFrom.padStart(2, "0")}-${dayFrom.padStart(2, "0")}`);

            let periodTo = null;
            if (exp.isProcessing === false) {
                if (!exp.periodTo[0]) {
                    return res.json({ success: false, message: "Period To is required if not ongoing!" });
                }
                const yearTo = exp.periodTo[0];
                const monthTo = exp.periodTo[1] || "01";
                const dayTo = exp.periodTo[2] || "01";
                periodTo = new Date(`${yearTo}-${monthTo.padStart(2, "0")}-${dayTo.padStart(2, "0")}`);
            }
            // Update fields
            expToUpdate.certificationName = exp.certificationName.trim().toLowerCase();
            expToUpdate.organization = exp.organization.trim().toLowerCase();
            expToUpdate.mode = exp.mode.trim().toLowerCase();
            expToUpdate.link = exp.link;
            expToUpdate.periodFrom = periodFrom;
            expToUpdate.periodTo = periodTo;
            expToUpdate.isProcessing = exp.isProcessing;      
            expToUpdate.description = exp.description || "";

            await existingCandidate.save();
            return res.json({ success: true, message: "Certificate updated successfully" });
        }
        else {
            return res.json({ success: false, message: "Certificate are required please try gain later!" })
        }
    }
    catch (err) {
        console.log("Error in Candidate Certificate", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving candidate Certificate" });
    }
})

// candidate experience delete  completed
summaryRouter.delete('/candidate-certificate-delete/:id', isAuth, async (req, res) => {
    try {
        const { id } = req.params
        if (!id) {
            return res.send({ success: false, message: "" })
        }
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
        // ---------- DELETE EXPERIENCE ----------
        const cerIndex = existingCandidate.certifications.findIndex(cer => cer._id.toString() === id);
        if (cerIndex === -1) {
            return res.status(404).json({ success: false, message: "Experience not found" });
        }

        existingCandidate.certifications.splice(cerIndex, 1); // remove experience
        const deleteCertifications = await existingCandidate.save();
        if (!deleteCertifications) {
            return res.status(200).json({ success: true, message: "Faild to delete certificate please try agin later!" });
        }
        else {
            return res.status(200).json({ success: true, message: "certificate deleted successfully!" });
        }
    }
    catch (err) {
        console.log("Error in Candidate experience", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving candidate experience" });
    }
})

// candidate create projects  completed
summaryRouter.post('/candidate-projects', isAuth, async (req, res) => {
    try {
        const { projects } = req.body
        console.log("projects", projects)
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
        //Candidate existence check
        const candidateData = await candidate.findOne({ user: userId });
        if (!candidateData) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
        }
        if (projects && projects.length > 0) {
            const formatProjects = [];
            for (const project of projects) {
                // 🔹 Validation check
                if (!project.projectName || !project.clientName || !project.periodFrom[0] || !project.role) {
                    return res.json({ success: false, message: "All mandatory fields are required!" });
                }
                // 🔹 Format periodFrom
                const yearFrom = project.periodFrom[0];
                const monthFrom = project.periodFrom[1] || "01";
                const dayFrom = project.periodFrom[2] || "01";
                const periodFrom = new Date(`${yearFrom}-${monthFrom.padStart(2, "0")}-${dayFrom.padStart(2, "0")}`);

                let periodTo = null;
                if (project.isProcessing === false) {
                    if (!project.periodTo[0]) {
                        return res.json({ success: false, message: "Period To is required if not ongoing!" });
                    }
                    const yearTo = project.periodTo[0];
                    const monthTo = project.periodTo[1] || "01";
                    const dayTo = project.periodTo[2] || "01";
                    periodTo = new Date(`${yearTo}-${monthTo.padStart(2, "0")}-${dayTo.padStart(2, "0")}`);
                }
                formatProjects.push({
                    projectName: project.projectName.trim().toLowerCase(),
                    clientName: project.clientName.trim().toLowerCase(),
                    role: project.role.trim().toLowerCase(),
                    periodTo: periodTo,
                    periodFrom: periodFrom,
                    isProcessing: project.isProcessing,
                    description: project.description || "",
                });
            }
            //DB save logic (spread operator so array not nested)
            candidateData.projects.push(...formatProjects);
            await candidateData.save();

            return res.json({ success: true, message: "Projects saved successfully" });
        }
    }
    catch (err) {
        console.log("Error in /candidate-Project route", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving candidate projects" });
    }
})

// candidate projects update completed
summaryRouter.put('/candidate-projects/:id', isAuth, async (req, res) => {
    try {
        const { id } = req.params
        const { projects } = req.body;
        console.log("certifications", projects, id);
        if (!id || !projects) {
            return res.send({ success: false, message: "All field are required pleade try agin later" })
        }
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

        if (projects && projects.length > 0) {
            const expToUpdate = existingCandidate.projects.id(id); // Mongoose subdocument find
            if (!expToUpdate) {
                return res.status(404).json({ success: false, message: "Projects not found" });
            }

            const exp = projects[0]; // Assuming only 1 object sent for update

            // Validation check
            if (!exp.projectName || !exp.clientName || !exp.role) {
                return res.json({ success: false, message: "All mandatory fields are required!" });
            }

            // 🔹 Format periodFrom
            const yearFrom = exp.periodFrom[0];
            const monthFrom = exp.periodFrom[1] || "01";
            const dayFrom = exp.periodFrom[2] || "01";
            const periodFrom = new Date(`${yearFrom}-${monthFrom.padStart(2, "0")}-${dayFrom.padStart(2, "0")}`);

            let periodTo = null;
            if (exp.isProcessing === false) {
                if (!exp.periodTo[0]) {
                    return res.json({ success: false, message: "Period To is required if not ongoing!" });
                }
                const yearTo = exp.periodTo[0];
                const monthTo = exp.periodTo[1] || "01";
                const dayTo = exp.periodTo[2] || "01";
                periodTo = new Date(`${yearTo}-${monthTo.padStart(2, "0")}-${dayTo.padStart(2, "0")}`);
            }
            // Update fields
            expToUpdate.projectName = exp.projectName.trim().toLowerCase();
            expToUpdate.clientName = exp.clientName.trim().toLowerCase();
            expToUpdate.role = exp.role.trim().toLowerCase();
            expToUpdate.location = exp.location;
            expToUpdate.periodFrom = periodFrom;
            expToUpdate.periodTo = periodTo;
            expToUpdate.isProcessing = exp.isProcessing;
            expToUpdate.description = exp.description || "";

            await existingCandidate.save();
            return res.json({ success: true, message: "Projects updated successfully" });
        }
        else {
            return res.json({ success: false, message: "Projets are required please try gain later!" })
        }
    }
    catch (err) {
        console.log("Error in Candidate Update projects", err);
        return res.status(500).json({ success: false, message: "Internal server error while updating candidate projects" });
    }
})

// candidate experience delete  completed
summaryRouter.delete('/candidate-projects-delete/:id', isAuth, async (req, res) => {
    try {
        const { id } = req.params
        if (!id) {
            return res.send({ success: false, message: "" })
        }
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
        // ---------- DELETE EXPERIENCE ----------
        const proIndex = existingCandidate.projects.findIndex(pro => pro._id.toString() === id);
        if (proIndex === -1) {
            return res.status(404).json({ success: false, message: "Experience not found" });
        }

        existingCandidate.projects.splice(proIndex, 1); // remove experience
        const deleteProjects = await existingCandidate.save();
        if (!deleteProjects) {
            return res.status(200).json({ success: true, message: "Faild to delete Projects please try agin later!" });
        }
        else {
            return res.status(200).json({ success: true, message: "projects delete successfully!" });
        }
    }
    catch (err) {
        console.log("Error in Candidate delete Projects", err);
        return res.status(500).json({ success: false, message: "Internal server error while delete candidate projects" });
    }
})

// candidate create projects  completed
summaryRouter.post('/candidate-social', isAuth, async (req, res) => {
    try {
        const { social } = req.body
        console.log("projects", social)
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
        //Candidate existence check
        const candidateData = await candidate.findOne({ user: userId });
        if (!candidateData) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
        }
        if (social && social.length > 0) {
            const formatSocial = [];
            for (const soc of social) {
                // 🔹 Validation check
                if (!soc.socialName) {
                    return res.json({ success: false, message: "All mandatory fields are required!" });
                }

                formatSocial.push({
                    socialName: soc.socialName.trim().toLowerCase(),
                    url: soc.url,
                    description: soc.description || "",
                });
            }
            //DB save logic (spread operator so array not nested)
            candidateData.socialProfiles.push(...formatSocial);
            await candidateData.save();

            return res.json({ success: true, message: "Social Profiles saved successfully" });
        }
    }
    catch (err) {
        console.log("Error in /candidate-socila route", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving candidate Social Profiles" });
    }
})

// candidate projects update completed
summaryRouter.put('/candidate-social/:id', isAuth, async (req, res) => {
    try {
        const { id } = req.params
        const { social } = req.body;
        console.log("certifications", social, id);
        if (!id || !social) {
            return res.send({ success: false, message: "All field are required pleade try agin later" })
        }
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

        if (social && social.length > 0) {
            const expToUpdate = existingCandidate.socialProfiles.id(id); // Mongoose subdocument find
            if (!expToUpdate) {
                return res.status(404).json({ success: false, message: "Projects not found" });
            }

            const exp = social[0]; // Assuming only 1 object sent for update

            // Validation check
            if (!exp.socialName) {
                return res.json({ success: false, message: "All mandatory fields are required!" });
            }

            // Update fields
            expToUpdate.socialName = exp.socialName.trim().toLowerCase();
            expToUpdate.url = exp.url;
            expToUpdate.description = exp.description || "";

            await existingCandidate.save();
            return res.json({ success: true, message: "Socila Profile updated successfully" });
        }
        else {
            return res.json({ success: false, message: "Socila Profile are required please try gain later!" })
        }
    }
    catch (err) {
        console.log("Error in Candidate Update Socila Profile", err);
        return res.status(500).json({ success: false, message: "Internal server error while updating candidate Socila Profile" });
    }
})

// candidate experience delete  completed
summaryRouter.delete('/candidate-social-delete/:id', isAuth, async (req, res) => {
    try {
        const { id } = req.params
        if (!id) {
            return res.send({ success: false, message: "" })
        }
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
        // ---------- DELETE EXPERIENCE ----------
        const socIndex = existingCandidate.socialProfiles.findIndex(soc => soc._id.toString() === id);
        if (socIndex === -1) {
            return res.status(404).json({ success: false, message: "Experience not found" });
        }

        existingCandidate.socialProfiles.splice(socIndex, 1); // remove experience
        const deleteSocialProfiles = await existingCandidate.save();
        if (!deleteSocialProfiles) {
            return res.status(200).json({ success: true, message: "Faild to delete social profiles please try agin later!" });
        }
        else {
            return res.status(200).json({ success: true, message: "Social profiles delete successfully!" });
        }
    }
    catch (err) {
        console.log("Error in Candidate delete social profiles", err);
        return res.status(500).json({ success: false, message: "Internal server error while delete candidate social profiles" });
    }
})

// candidate create Education completed
summaryRouter.post('/candidate-education' , isAuth , async (req,res) => {
    try{
        const { education } = req.body
        console.log("education" ,education)
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

        if (education && education.length > 0) {
            const formatEducation = [];

            for (const edu of education) {
                // 🔹 Validation check
                if (!edu.institutionName || !edu.courseCategory || !edu.periodFrom[0] || !edu.courseType || !edu.grade || !edu.city || !edu.mode) {
                    return res.json({ success: false, message: "All mandatory fields are required!" });
                }

                // 🔹 Format periodFrom
                const yearFrom = edu.periodFrom[0];
                const monthFrom = edu.periodFrom[1] || "01";
                const dayFrom = edu.periodFrom[2] || "01";
                const periodFrom = new Date(`${yearFrom}-${monthFrom.padStart(2, "0")}-${dayFrom.padStart(2, "0")}`);

                let periodTo = null;
                if (edu.isOngoing === false) {
                    if (!edu.periodTo[0]) {
                        return res.json({ success: false, message: "Period To is required if not ongoing!" });
                    }
                    const yearTo = edu.periodTo[0];
                    const monthTo = edu.periodTo[1] || "01";
                    const dayTo = edu.periodTo[2] || "01";
                    periodTo = new Date(`${yearTo}-${monthTo.padStart(2, "0")}-${dayTo.padStart(2, "0")}`);
                }

                formatEducation.push({
                    courseCategory: edu.courseCategory.trim().toLowerCase(),
                    courseType: edu.courseType.trim().toLowerCase(),
                    courseName: edu.courseName || "",
                    institutionName: edu.institutionName.trim().toLowerCase(),
                    endDate: periodTo,
                    startDate: periodFrom,
                    isOngoing: edu.isOngoing,
                    mode : edu.mode,
                    grade: {
                        type: edu.grade.type.trim().toLowerCase() && edu.grade.type.trim().toLowerCase() || "",
                        value: Number(edu.grade.value) || ""
                    },
                    mode: edu.mode || "",
                    location: edu.location || "", 
                    city: edu.city.trim().toLowerCase(),                                
                    state: edu.state || "",
                    country: edu.country || "",
                    zipCode: edu.zipCode || "" ,
                    description: edu.description || "",                                       
                });
            }

            //DB save logic (spread operator so array not nested)
            existingCandidate.educations.push(...formatEducation);
            await existingCandidate.save();

            return res.json({ success: true, message: "Education saved successfully" });
        } else {
            return res.json({ success: false, message: "Education data is required!" });
        }

    }
    catch(err){
        console.log("Error in candidate create education" ,err)
        return res.status(500).json({ success: false, message: "Internal server error while delete candidate education" });
    }
})

// candidate experience update completed
summaryRouter.put('/candidate-education/:id', isAuth, async (req, res) => {
    try {
        const { id } = req.params
        const { education } = req.body;
        console.log("education", education, id);
        if (!id || !education) {
            return res.send({ success: false, message: "All field are required pleade try agin later" })
        }
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

        if (education && education.length > 0) {
            const eduToUpdate = existingCandidate.educations.id(id); // Mongoose subdocument find
            if (!eduToUpdate) {
                return res.status(404).json({ success: false, message: "Experience not found" });
            }

            const edu = education[0]; // Assuming only 1 object sent for update

            // Validation check
            if (!edu.courseCategory || !edu.courseType || !edu.periodFrom[0] || !edu.city || !edu.mode || !edu.grade || !edu.institutionName) {
                return res.json({ success: false, message: "All mandatory fields are required!" });
            }

            // 🔹 Format periodFrom
            const yearFrom = edu.periodFrom[0];
            const monthFrom = edu.periodFrom[1] || "01";
            const dayFrom = edu.periodFrom[2] || "01";
            const periodFrom = new Date(`${yearFrom}-${monthFrom.padStart(2, "0")}-${dayFrom.padStart(2, "0")}`);

            let periodTo = null;
            if (edu.isOngoing === false) {
                if (!edu.periodTo[0]) {
                    return res.json({ success: false, message: "Period To is required if not ongoing!" });
                }
                const yearTo = edu.periodTo[0];
                const monthTo = edu.periodTo[1] || "01";
                const dayTo = edu.periodTo[2] || "01";
                periodTo = new Date(`${yearTo}-${monthTo.padStart(2, "0")}-${dayTo.padStart(2, "0")}`);
            }

            // Update fields
            eduToUpdate.institutionName = edu.institutionName.trim().toLowerCase();
            eduToUpdate.courseCategory = edu.courseCategory.trim().toLowerCase();
            eduToUpdate.courseType = edu.courseType.trim().toLowerCase();
            eduToUpdate.courseName = edu.courseName;            
            eduToUpdate.startDate = periodFrom;
            eduToUpdate.endDate = periodTo;
            eduToUpdate.mode = edu.mode.trim().toLowerCase();            
            eduToUpdate.isOngoing = edu.isOngoing;
            eduToUpdate.grade = edu.grade
            eduToUpdate.location = edu.location || "";
            eduToUpdate.city = edu.city.trim().toLowerCase();
            eduToUpdate.state = edu.state || "";
            eduToUpdate.country = edu.country || "";
            eduToUpdate.zipCode = edu.zipCode || "";
            eduToUpdate.description = edu.description || "";

            await existingCandidate.save();
            return res.json({ success: true, message: "Education updated successfully" });
        }
        else {
            return res.json({ success: false, message: "Education are required please try gain later!" })
        }
    }
    catch (err) {
        console.log("Error in Candidate education", err);
        return res.status(500).json({ success: false, message: "Internal server error while saving candidate education" });
    }
})

// candidate experience delete  completed
summaryRouter.delete('/candidate-education-delete/:id', isAuth, async (req, res) => {
    try {
        const { id } = req.params
        console.log("id",id)
        if (!id) {
            return res.send({ success: false, message: "" })
        }
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
        // ---------- DELETE EXPERIENCE ----------
        const eduIndex = existingCandidate.educations.findOne(edu => edu._id.toString() === id);
        if (eduIndex === -1) {
            return res.status(404).json({ success: false, message: "Experience not found" });
        }

        existingCandidate.educations.splice(eduIndex, 1); // remove education
        const deleteEducationProfiles = await existingCandidate.save();
        if (!deleteEducationProfiles) {
            return res.status(200).json({ success: true, message: "Faild to delete education please try agin later!" });
        }
        else {
            return res.status(200).json({ success: true, message: "Education delete successfully!" });
        }
    }
    catch (err) {
        console.log("Error in Candidate delete education", err);
        return res.status(500).json({ success: false, message: "Internal server error while delete candidate education"});
    }
})

// helper
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// candidate skills create delete  completed
summaryRouter.post('/candidate-skills', isAuth, async (req, res) => {
    try {
        const { skills } = req.body;
        // Basic validation
        if (!skills || !skills.skills || String(skills.skills).trim() === "") {
            return res.status(400).json({ success: false, message: "Skill name is required." });
        }

        // Session + role checks
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        if (req.session.user.role !== "job-seeker") {
            return res.status(403).json({ success: false, message: "Access denied: Only job-seeker allowed" });
        }

        // Find user doc
        const userDoc = await userModel.findOne({ id: req.session.user.id });
        if (!userDoc) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Find candidate profile
        const existingCandidate = await candidate.findOne({ user: userDoc._id });
        if (!existingCandidate) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
        }

        // Normalize incoming name
        const incomingSkillName = String(skills.skills).trim();
        const skillRegex = new RegExp(`^${escapeRegExp(incomingSkillName)}$`, "i");

        // Find or create master skill (case-insensitive)
        let masterSkill = await Skill.findOne({ skillName: skillRegex });
        if (!masterSkill) {
            masterSkill = new Skill({ skillName: incomingSkillName.toLowerCase() });
            await masterSkill.save();
        }

        // Ensure arrays exist
        existingCandidate.skills = Array.isArray(existingCandidate.skills) ? existingCandidate.skills : [];


        // Compare candidate.skills by s.skill (your schema)
        const skillIdx = existingCandidate.skills.findIndex(
            (s) => s.skill && String(s.skill).trim().toLowerCase() === incomingSkillName.toLowerCase()
        );

        const isPrimaryFlag = !!skills.isPrimary;

        // Build experience object from incoming array (use first item if provided)
        const incomingExp = Array.isArray(skills.experience) && skills.experience.length > 0
            ? skills.experience[0]
            : null;

        const expObj = {
            month: incomingExp && incomingExp.month ? Number(incomingExp.month) : undefined,
            year: incomingExp && incomingExp.year ? Number(incomingExp.year) : undefined,
        };

        // === CASE: isPrimary === true (allow multiple primaries) ===
        if (isPrimaryFlag) {
            // IMPORTANT: do NOT unset other isPrimary flags — since you want multiple primary skills.
            // Update or add candidate.skills entry and mark this one as primary
            if (skillIdx > -1) {
                existingCandidate.skills[skillIdx] = {
                    ...existingCandidate.skills[skillIdx],
                    masterSkillId: masterSkill._id.toString(),
                    skill: incomingSkillName.toLowerCase(),
                    experience: {
                        month: expObj.month ?? existingCandidate.skills[skillIdx].experience?.month,
                        year: expObj.year ?? existingCandidate.skills[skillIdx].experience?.year
                    },
                    lastUsed: skills.lastUsed ? Number(skills.lastUsed) : existingCandidate.skills[skillIdx].lastUsed,
                    version: skills.version ?? existingCandidate.skills[skillIdx].version,
                    isPrimary: true
                };
            } else {
                existingCandidate.skills.push({
                    masterSkillId: masterSkill._id.toString(),
                    skill: incomingSkillName.toLowerCase(),
                    experience: {
                        month: expObj.month,
                        year: expObj.year
                    },
                    lastUsed: skills.lastUsed ? Number(skills.lastUsed) : undefined,
                    version: skills.version ? String(skills.version) : undefined,
                    isPrimary: true
                });
            }

            await existingCandidate.save();
            return res.json({ success: true, message: "Primary skill added to your profile." });
        }


        // === CASE: isPrimary === false ===
        // If skill already exists in candidate.skills -> duplicate
        if (skillIdx > -1) {
            return res.status(400).json({ success: false, message: "Skill already exists in your profile. Choose another skill." });
        }

        // Add new non-primary skill
        const newSkillEntry = {
            masterSkillId: masterSkill._id.toString(),
            skill: incomingSkillName.toLowerCase(),
            experience: {
                month: expObj.month,
                year: expObj.year
            },
            lastUsed: skills.lastUsed ? Number(skills.lastUsed) : undefined,
            version: skills.version ? String(skills.version) : undefined,
            isPrimary: false
        };

        existingCandidate.skills.push(newSkillEntry);
        await existingCandidate.save();
        return res.json({ success: true, message: "Skill added to profile", skill: newSkillEntry });

    } catch (err) {
        console.error("Error in candidate-skills route:", err);
        return res.status(500).json({ success: false, message: "Internal server error while updating candidate skills" });
    }
});

// candidate skills  delete  completed
summaryRouter.delete('/candidate-delete-skill/:id', isAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ success: false, message: "Skill id is required." });
        }

        // Session + role checks
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        if (req.session.user.role !== "job-seeker") {
            return res.status(403).json({ success: false, message: "Access denied: Only job-seeker allowed" });
        }

        // Find user doc
        const userDoc = await userModel.findOne({ id: req.session.user.id });
        if (!userDoc) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Find candidate profile (use userDoc._id)
        const existingCandidate = await candidate.findOne({ user: userDoc._id });
        if (!existingCandidate) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
        }

        // Ensure skills array exists
        existingCandidate.skills = Array.isArray(existingCandidate.skills) ? existingCandidate.skills : [];

        // Try find skill by subdoc _id
        let foundIndex = existingCandidate.skills.findIndex(s => s._id && String(s._id) === String(id));

        // If not found, try by masterSkillId
        if (foundIndex === -1) {
            foundIndex = existingCandidate.skills.findIndex(s => s.masterSkillId && String(s.masterSkillId) === String(id));
        }

        // If still not found, try by skill name (case-insensitive)
        if (foundIndex === -1) {
            const idLower = String(id).trim().toLowerCase();
            foundIndex = existingCandidate.skills.findIndex(s => s.skill && String(s.skill).trim().toLowerCase() === idLower);
        }

        if (foundIndex === -1) {
            return res.status(404).json({ success: false, message: "Skill not found in candidate profile." });
        }

        // Remove the skill from skills array
        const removed = existingCandidate.skills.splice(foundIndex, 1)[0]

        // Save candidate
        await existingCandidate.save();

        return res.json({
            success: true,
            message: "Skill removed from profile successfully.",
            removedSkill: {
                skill: removed.skill || null,
                masterSkillId: removed.masterSkillId || null,
                wasPrimary: !!removed.isPrimary
            }
        });
    } catch (err) {
        console.error("Error in candidate-delete-skills route:", err);
        return res.status(500).json({ success: false, message: "Internal server error while deleting candidate skill" });
    }
});


summaryRouter.put('/candidate-update-skill/:id', isAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { skills: newSkills } = req.body;

        if (!id || !newSkills) {
            return res.status(400).json({ success: false, message: "All fields are required!" });
        }
        if (!req.session?.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        if (req.session.user.role !== "job-seeker") {
            return res.status(403).json({ success: false, message: "Access denied" });
        }
        const userDoc = await userModel.findOne({ id: req.session.user.id });
        if (!userDoc) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const existingCandidate = await candidate.findOne({ user: userDoc._id });
        if (!existingCandidate) {
            return res.status(400).json({ success: false, message: "Candidate profile does not exist." });
        }
        let updateSkills = Array.isArray(newSkills) ? newSkills : [newSkills];
        for (let skill of updateSkills) {
            if (!skill) {
                return res.status(400).json({ success: false, message: "Invalid skill data" });
            }
            let foundIndex = existingCandidate.skills.findIndex(
                (s) => s._id && String(s._id) === String(id)
            );

            if (foundIndex === -1) {
                return res.status(404).json({ success: false, message: "Skill ID not found" });
            }
            existingCandidate.skills[foundIndex] = {
                ...existingCandidate.skills[foundIndex]._doc,
                ...skill,
            };
        }
        await existingCandidate.save();

        return res.json({success: true,message: "Skills updated successfully",skills: existingCandidate.skills});
    } catch (err) {
        console.error("Error in candidate-update-skills route:", err);
        return res.status(500).json({ success: false, message: "Internal server error while updating skills"});
    }
});



















// summaryRouter.post('/candidate-skills', isAuth, async (req, res) => {
//     try {
//         const { skills, type } = req.body
//         console.log("skills", skills, type)
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
//         const existingCandidate = await candidate.findOne({ user: userId })
//         if (!existingCandidate) {
//             return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
//         }
//         if (type === "primarySkills") {
//             if (skills && skills.length > 0) {
//                 // Normalize skills to include experience properly
//                 const formattedSkills = skills.map((s) => ({
//                     id: s.id,
//                     primarySkill: s.primarySkill.trim().toLowerCase(),
//                     experience: Array.isArray(s.experience)
//                         ? s.experience[0]
//                         : s.experience || { month: 0, year: 0 },
//                     lastUsed: s.lastUsed || "",
//                     version: s.version || "",
//                 }));

//                 // Remove duplicates by primarySkill
//                 const existingSkillNames = existingCandidate.primarySkills
//                     .map((s) => s.primarySkill.trim().toLowerCase());
//                 const merged = [...existingSkillNames, ...formattedSkills.map(f => f.primarySkill)];
//                 const uniqueSkillNames = [...new Set(merged)];

//                 const uniqueFormattedSkills = uniqueSkillNames.map(name => {
//                     const skill = formattedSkills.find(f => f.primarySkill === name)
//                         || existingCandidate.primarySkills.find(e => e.primarySkill === name);
//                     return skill;
//                 });

//                 existingCandidate.primarySkills = uniqueFormattedSkills;
//                 existingCandidate.skills = uniqueFormattedSkills;

//                 await existingCandidate.save();
//                 return res.status(200).json({
//                     success: true,
//                     message: "Primary skills saved successfully",
//                     data: existingCandidate.primarySkills
//                 });
//             }
//         }

//         else {
//             return res.status(400).json({ success: false, message: "Invalid type specified" });
//         }




//     }
//     catch (err) {
//         console.log("Error in Candidate skills", err);
//         return res.status(500).json({ success: false, message: "Internal server error while saving candidate skills" });
//     }
// })

// summaryRouter.post('/educationinformation',isAuth , async (req,res)=>{
//     try{
//         const { profileSummary, address } = req.body;
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
//         const existingCandidate = await candidate.findOne({ "user.id": userId })
//         if (!existingCandidate) {
//             return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
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
        const candidateScore = candidateInformation.score || "";
        const candidateCertificates = candidateInformation.certifications || [];
        const candidateProjects = candidateInformation.projects || []
        const candidateSocilaProfile = candidateInformation.socialProfiles || []

        


        return res.json({
            success: true,
            candidateInformation,
            candidateExperience,
            candidateEducation,
            candidateSkills,
            candidatePrimarySkills,
            candidateScore,
            candidateCertificates,
            candidateProjects,
            candidateSocilaProfile
        });

    } catch (err) {
        console.log("Error in /fetch-information route", err);
        return res.status(500).json({ success: false, message: "Internal server error while fetching candidate information" });
    }
});

summaryRouter.get('/fetch-skills', async (req, res) => {
    try {
        const skills = await Skill.find({}, { skillName: 1, _id: 0 });
        // only skillName fetch
        if (!skills || skills.length === 0) {
            return res.json({success: false, message: "No skills found, please try again later" });
        }
        // skillName → { label, value }
        const formattedSkills = skills.map(s => ({
            label: s.skillName,
            value: s.skillName
        }));

        return res.json({success: true,skills: formattedSkills});

    } catch (err) {
        console.log("Error in /fetch-skills route", err);
        return res.status(500).json({success: false,message: "Internal server error while fetching skills"});
    }
});







// summaryRouter.post('/education' , async (req,res) =>{
//     try{
//         const { education } = req.body
//         console.log("education",education)

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
//         const existingCandidate = await candidate.findOne({ "user.id": userId.id })
//         if (!existingCandidate) {
//             return res.status(400).json({ success: false, message: "Candidate profile does not exist. Please complete your profile first." });
//         } 
        
//         // 🔹 Mandatory fields validation
//         for (let i = 0; i < education.length; i++) {
//             const edu = education[i];
//             if (
//                 !edu.institutionName ||
//                 !edu.courseCategory ||
//                 !edu.courseType ||
//                 !edu.courseName ||
//                 !edu.gradeType ||
//                 !edu.gradeValue ||
//                 !edu.industryType ||
//                 !edu.periodFromYear ||
//                 (!edu.isOngoing && !edu.periodToYear)
//             ) {
//                 return res.status(400).json({
//                     success: false,
//                     message: `Education entry ${i + 1} is missing mandatory fields.`
//                 });
//             }
//         }

//         // 🔹 Save education to candidate
//         existingCandidate.education = education;
//         await existingCandidate.save();

//         return res.status(200).json({ success: true, message: "Education saved successfully." });

//     }
//     catch (err) {
//         console.log("Error in /personalInfromation route", err);
//         return res.status(500).json({ success: false, message: "Internal server error while saving personal information" });
//     }
// })

module.exports = summaryRouter;
