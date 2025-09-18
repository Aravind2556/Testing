const express = require('express');
const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const Employer = require('../models/Employer');
const Job = require('../models/Job');
const Application = require('../models/Application');
const isEmployer = require('../middleware/isEmployer');
const isAuth = require('../middleware/isAuth');
const router = express.Router();

/**
 * GET /employer/metrics
 * Returns counts for dashboard cards:
 *  - searchCandidates: total candidate profiles
 *  - proSearch: same as above (or you could filter for 'pro' candidates)
 *  - createJobs: total jobs created by this employer
 *  - manageJobs: same as createJobs
 *  - applicants: total applications across this employer's jobs
 *  - account: always 1 (your own account)
 */
router.get('/employer/metrics', isEmployer, async (req, res) => {   
  try {
    // Find employer record for current user
    const userId = req.session.user._id;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user session.' });
    }

    const employer = await Employer.findOne({ user: userId }).select('_id');
    if (!employer) {
      const totalCandidates = await Candidate.countDocuments({})
      return res.status(404).json({ success: false, message: 'Employer profile not found.', totalCandidates });
    }

    // Run all counts in parallel
    const [
      totalCandidates,
      totalJobs,
      totalApplications
    ] = await Promise.all([
      Candidate.countDocuments({}),                                              // all candidates
      Job.countDocuments({ createdBy: employer._id }),                           // jobs by this employer
      Application.countDocuments({ job: { $in: await Job.find({ createdBy: employer._id }).distinct('_id') } })
    ]);

    const metrics = {
      searchCandidates: totalCandidates,
      proSearch: totalCandidates,
      createJobs: 1,
      manageJobs: totalJobs,
      applicants: totalApplications,
      account: 1
    };

    return res.json({ success: true, metrics });
  } catch (err) {
    console.error('Error in /employer/metrics:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to fetch dashboard metrics.'
    });
  }
});


router.get('/employer/applications', isAuth, async (req, res) => {
  try {
    // parse + validate pagination & filter params
    let { page='1', perPage='10', status='all' } = req.query;
    page = parseInt(page,10); perPage = parseInt(perPage,10);
    if (isNaN(page)||page<1) page = 1;
    if (isNaN(perPage)||perPage<1) perPage = 10;


    // 1) find employer
    const userId = req.session.user._id;
    if (!mongoose.isValidObjectId(userId)) 
      return res.status(400).json({success:false,message:'Invalid session.'});
    const employer = await Employer.findOne({user:userId}).select('_id');
    if (!employer) 
      return res.status(404).json({success:false,message:'Employer not found.'});

    // 2) find jobs by that employer
    const jobs = await Job.find({createdBy:employer._id}).select('_id');
    const jobIds = jobs.map(j=>j._id);

    // 3) Only include where applicationStatus or saveStatus is true
    let filter = {
      job: { $in: jobIds }
    };

    if(status === "all"){
      filter.$or = [{ applicationStatus: true }, { saveStatus: true }]
    }
    else if(status === "applied"){
      filter.$or = [{ applicationStatus: true }]
    }
    else if(status === "saved"){
      filter.$or = [{ saveStatus: true }]
    }

    // 4) count + fetch page
    const totalCount = await Application.countDocuments(filter);
    const totalPages = Math.ceil(totalCount/perPage) || 1;

    // status priority sort: applied(0)→saved(1)→others(2), then by appliedAt desc
    const applications = await Application.find(filter)
      .populate('job','id title')
      .populate('candidate','applicantFullName emailAddress')
      .sort({ hiringStatus: 1, applicationStatus: -1, saveStatus: -1, appliedAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean();

      return res.json({
        success: true,
        applications,
        pagination: { currentPage: page, perPage, totalPages, totalCount }
      });
  }
  catch(err){
    console.error('Error in employer/applications:', err);
    return res.status(500).json({success:false,message:'Server error.'});
  }
});

router.get('/fetch-company/:id', async (req, res) => {
  try{
    const { id } = req.params;
    // 1) Validate ID
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid company ID.',
      });
    }
    // 2) Fetch
    const company = await Employer.findById(id).lean();
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found.',
      });
    }
    // 3) Return
    return res.json({
      success: true,
      company,
    });
  }
  catch(err){
    console.error('Error in fetching Company:', err);
    return res.status(500).json({success:false,message:'Trouble in fetching Company! please contact Support team or try again later.'});
  }
})

module.exports = router;
