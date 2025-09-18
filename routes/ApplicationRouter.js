const Express = require('express')
const isAuth = require('../middleware/isAuth')
const Job = require('../models/Job')
const Application = require('../models/Application')
const Candidate = require('../models/Candidate')
const Notification = require('../models/Notification')
const mongoose = require('mongoose')
const isEmployer = require('../middleware/isEmployer')
const Employer = require('../models/Employer')
const userModel = require('../models/User')

const router = Express.Router()


// helper to zero‑pad the numeric part
function pad(num, size = 4) {
    let s = String(num);
    while (s.length < size) s = '0' + s;
    return s;
}

router.post('/apply-job', isAuth, async (req, res) => {
    try {
        const { jobId } = req.body

        // Step 1: Validate input
        if (!jobId) {
            return res.status(400).json({ success: false, message: "Job ID is required." })
        }

        // Step 2: Check if the job exists and is live
        const job = await Job.findOne({ _id: jobId, status: 'live' })
        if (!job) {
            return res.status(404).json({ success: false, message: "Job not found or not open for applications." })
        }

        // Step 3: Get candidate using session
        const userId = req.session?.user?._id
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please login again." })
        }

        const candidate = await Candidate.findOne({ user: userId })
        if (!candidate) {
            return res.status(404).json({ success: false, message: "Candidate profile not found." })
        }

        // Step 4: Check if the candidate has already applied
        const existingApplication = await Application.findOne({ candidate: candidate._id, job: jobId })
        if (existingApplication) {

            if (existingApplication.applicationStatus !== true) {
                const updateApplication = await Application.updateOne({ candidate: candidate._id, job: jobId }, { $set: { applicationStatus: true } })
                if (!updateApplication) {
                    return res.status(404).json({ success: false, message: "Trouble in updating the status of Job application! Please contact support team or try again later." })
                }

                return res.json({ success: true, message: "Job applied successfully!" })
            }

            return res.status(409).json({ success: false, message: "You have already applied to this job." })
        }

        // Generate a new sequential application.id
        // Find last inserted application's numeric suffix
        const last = await Application.findOne()
            .sort({ createdAt: -1 })
            .select('id')
            .lean();

        let nextNum = 1;
        if (last && /^sanapp(\d+)$/.test(last.id)) {
            const [, n] = last.id.match(/^sanapp(\d+)$/);
            nextNum = Number(n) + 1;
        }
        const newAppId = 'sanapp' + pad(nextNum);

        // Create new application
        const newApplication = new Application({
            id: newAppId,
            candidate: candidate._id,
            job: jobId,
            applicationStatus: true
        })

        await newApplication.save()

        return res.status(201).json({
            success: true,
            message: "Job application submitted successfully.",
            application: newApplication
        })
    }
    catch (err) {
        console.log("Error in applying Job:", err)
        return res.status(500).json({ success: false, message: "Trouble in applying Job! Please contact support team or try again later." })
    }
})

router.get('/my-applications', isAuth, async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cand = await Candidate.findOne({ user: userId }).select('_id');
        if (!cand) {
            return res.json({ success: false, message: 'Candidate not found', popup: false });
        }

        const apps = await Application.find({ candidate: cand._id }).lean();
        const savedList = apps.filter(a => a.saveStatus === true).map(a => a.job.toString());
        const appliedList = apps.filter(a => a.applicationStatus === true).map(a => a.job.toString());

        res.json({ success: true, savedList, appliedList });
    } catch (err) {
        console.error('Error in my-applications:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/toggle-save', isAuth, async (req, res) => {
    try {
        const { jobId } = req.body;
        const userId = req.session.user._id;
        const cand = await Candidate.findOne({ user: new mongoose.Types.ObjectId(userId) })
        if (!cand) return res.status(404).json({ success: false, message: 'Candidate not found', popup: false });

        // ensure job exists
        const job = await Job.findOne({_id: new mongoose.Types.ObjectId(jobId)})
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

        let app = await Application.findOne({ candidate: cand._id, job: new mongoose.Types.ObjectId(jobId) });
        if (!app) {

            // Generate a new sequential application.id
            // Find last inserted application's numeric suffix
            const last = await Application.findOne()
                .sort({ createdAt: -1 })
                .select('id')
                .lean();

            let nextNum = 1;
            if (last && /^sanapp(\d+)$/.test(last.id)) {
                const [, n] = last.id.match(/^sanapp(\d+)$/);
                nextNum = Number(n) + 1;
            }
            const newAppId = 'sanapp' + pad(nextNum);

            // create as saved
            app = await Application.create({
                id: newAppId,
                candidate: cand._id,
                job: jobId,
                saveStatus: true
            });
        } else {
            // toggle off if saved → withdrawn, otherwise saved
            app.saveStatus = true
            await app.save();
        }

        // return fresh saved list
        const saved = await Application.find({ candidate: cand._id, saveStatus: true })
            .select('job').lean();
        const savedList = saved.map(x => x.job.toString());

        res.json({ success: true, savedList, message: "Successfully saved the application!" });
    } catch (err) {
        console.error('Error in toggle-save:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Helper to validate ObjectId
function requireValidId(id, res) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, message: 'Invalid application ID.' });
    return false;
  }
  return true;
}

router.get('/withdraw-job/:id', isAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!requireValidId(id, res)) return;

    const result = await Application.updateOne({job: id}, { $set: {applicationStatus: false} });
    if (!result) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }
    return res.json({ success: true, message: 'Sucessfully withdrawn the Application!' });
  } catch (err) {
    console.error('Error in withdrawing application:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble withdrawing application, please try again later.'
    });
  }
});

router.get('/remove-saved-job/:id', isAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!requireValidId(id, res)) return;

    const userId = req.session.user._id;
    const cand = await Candidate.findOne({ user: new mongoose.Types.ObjectId(userId) })
    if (!cand) return res.status(404).json({ success: false, message: 'Candidate not found', popup: false });    

    const result = await Application.updateOne({ candidate: cand._id, job: new mongoose.Types.ObjectId(id)}, { $set: {saveStatus: false} });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }
    
    return res.json({ success: true, message: 'Job un-saved successfully!' });
  } catch (err) {
    console.error('Error in un-saving job:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble un-saving job, please try again later.'
    });
  }
});

router.post('/update-application-status', isEmployer, async (req, res) => {
  try{
    const {id, status} = req.body

    const fetchEmployer = await Employer.findOne({user: req.session.user._id})
    if(!fetchEmployer){
      return res.status(400).json({success: false, message: "Employer data is found!"})
    }

    if(!id || !status){
      return res.status(400).json({success: false, message: "The ID or Status is not found!"})
    }

    if(!['rejected', 'shortlisted'].includes(status.toLowerCase())){
      return res.status(400).json({success: false, message: "Kindly provide a valid Status!"})
    }

    const fetchApplication = await Application.findOne({id}).populate("candidate")
    if(!fetchApplication){
      return res.status(400).json({success: false, message: "No Job application data is found!"})
    }

    if(fetchApplication.hiringStatus){
      return res.status(204).json({success: false, message: "You have already updated the status!"})
    }

    const fetchJob = await Job.findOne({ _id: fetchApplication.job })
    if(!fetchJob){
      return res.status(400).json({success: false, message: "Failed to fetch Job data!"})
    }

    if(fetchEmployer.id === new mongoose.Types.ObjectId(fetchJob.createdBy).toString()){
       const updateApplication = await Application.updateOne({id}, {$set: {hiringStatus: status}})

       if(!updateApplication){
        return res.status(500).json({status: false, message: "Failed to update Job application!"})
       }

       const fetchApplicant = await userModel.findOne({_id: new mongoose.Types.ObjectId(fetchApplication.candidate.user)})

       if(!fetchApplicant){
        return res.status(400).json({success: false, message: "Failed to fetch the applicant!"})
       }

       const createNotification = new Notification({
        userId: fetchApplicant.id,
        title: `Application status changed`,
        description: `Your application for the job ${fetchJob.title} has been ${status} by ${fetchEmployer.companyName}.`,
        type: 'job-application'
       })

       const saveNotificationn = await createNotification.save()

       if(!saveNotificationn){
        return res.status(204).json({success: false, message: 'Failed to create notification! Successfully updated the Job application status.'})
       }

       return res.status(201).json({status: true, message: "Job application status updated successfully!"})
    }

    return res.status(403).json({success: false, message: "Permission denied! Failed to update Application status."})
  }
  catch(err){
    console.error('Error in updating Application status:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble in updating Application status, please try again later.'
    });
  }
})


module.exports = router