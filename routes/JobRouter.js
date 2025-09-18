const express = require('express');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const Employer = require('../models/Employer');
const isEmployer = require('../middleware/isEmployer');
const isAuth = require('../middleware/isAuth');
const Applications = require('../models/Application');
const Candidate = require('../models/Candidate');
const router = express.Router();

// helper validators
const isValidEnum = (val, arr) => arr.includes(val);

const LOCATION_TYPES = ['onsite', 'remote', 'hybrid'];
const EMPLOY_TYPES = ['ft', 'pt', 'contract'];

function padNum(num, size = 4) {
  let s = String(num);
  while (s.length < size) s = '0' + s;
  return s;
}

router.post('/create-job', isEmployer, async (req, res) => {
  try {
    // 0) Parse nested JSON if necessary
    let { title, description, skills, requirements, experience,
      salary, location, industry, employmentType, deadline, isEnable } = req.body;

    if (typeof skills === 'string') skills = JSON.parse(skills);
    if (typeof requirements === 'string') requirements = JSON.parse(requirements);
    if (typeof experience === 'string') experience = JSON.parse(experience);
    if (typeof salary === 'string') salary = JSON.parse(salary);
    if (typeof location === 'string') location = JSON.parse(location);
    if (typeof isEnable === 'string') isEnable = isEnable === 'true';

    // 1) Validate inputs
    const errors = [];
    if (!title?.trim()) errors.push('title is required.');
    if (!description?.trim()) errors.push('description is required.');

    if (!Array.isArray(skills) || skills.length === 0)
      errors.push('Add at least one skill.');
    if (!Array.isArray(requirements) || requirements.length === 0)
      errors.push('Add at least one requirement.');

    if (!experience
      || typeof experience.min !== 'number'
      || typeof experience.max !== 'number')
      errors.push('experience.min and .max must be numbers.');
    else if (experience.max < experience.min)
      errors.push('experience.max must be ≥ experience.min.');

    if (!salary
      || typeof salary.min !== 'number'
      || typeof salary.max !== 'number')
      errors.push('salary.min and .max must be numbers.');
    else if (salary.max < salary.min)
      errors.push('salary.max must be ≥ salary.min.');

    if (!location
      || !isValidEnum(location.type, LOCATION_TYPES))
      errors.push(`location.type must be one of [${LOCATION_TYPES.join(', ')}].`);
    if (location.type === 'onsite' && !location.city?.trim())
      errors.push('location.city is required for onsite jobs.');

    if (!industry?.trim())
      errors.push('industry is required.');
    if (!isValidEnum(employmentType, EMPLOY_TYPES))
      errors.push(`employmentType must be one of [${EMPLOY_TYPES.join(', ')}].`);

    const dl = new Date(deadline);
    if (!deadline || isNaN(dl.getTime()))
      errors.push('Valid deadline date is required.');
    // else if (dl < new Date())
    //   errors.push('deadline must be in the future.');

    if (typeof isEnable !== 'boolean')
      errors.push('isEnable must be true or false.');

    if (errors.length) {
      return res.status(400).json({ success: false, message: errors.join(' ') });
    }

    // 2) Generate sequential job ID
    const last = await Job.findOne().sort({ createdAt: -1 }).select('id').lean();
    let nextNum = 1;
    if (last && /^sanjob(\d+)$/.test(last.id)) {
      const [, n] = last.id.match(/^sanjob(\d+)$/);
      nextNum = Number(n) + 1;
    }
    const newId = 'sanjob' + padNum(nextNum);

    // 3) Lookup employer
    const employer = await Employer.findOne({ user: req.session.user._id }).select('_id');
    if (!employer) {
      return res.status(403).json({ success: false, message: 'Employer profile not found.' });
    }

    // 4) Create job
    const job = await Job.create({
      id: newId,
      title: title.trim(),
      description: description.trim(),
      skills,
      requirements,
      experience: { min: experience.min, max: experience.max },
      salary: { min: salary.min, max: salary.max },
      location: { type: location.type, city: location.city?.trim() || '' },
      industry: industry.trim(),
      employmentType,
      deadline: dl,
      status: isEnable ? "live" : "draft",
      createdBy: employer._id
    });

    return res.json({
      success: true,
      message: 'Job created successfully.',
      job
    });
  }
  catch (err) {
    console.log('Error in creating Job:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble in creating Job! please contact support team or try again later.'
    });
  }
});

// API for fetching Job Search
router.get('/fetch-jobs', async (req, res) => {
  try {
    const { role, _id: userId } = req.session.user;

    // --- Parse & validate query params ---
    let { page = '1', perPage = '5', keyword = '', location = '', skills = '[]' } = req.query;

    const p = parseInt(page, 10);
    const pp = parseInt(perPage, 10);
    if (isNaN(p) || p < 1) return res.status(400).json({ success: false, message: 'Invalid page' });
    if (isNaN(pp) || pp < 1) return res.status(400).json({ success: false, message: 'Invalid perPage' });

    let skillArr;
    try { skillArr = JSON.parse(skills); }
    catch { return res.status(400).json({ success: false, message: 'Skills must be JSON array' }); }
    if (!Array.isArray(skillArr)) {
      return res.status(400).json({ success: false, message: 'Skills must be array' });
    }

    // --- Build filter object ---
    const filter = {};
    // role-based
    if (role === 'employer') {
      const emp = await Employer.findOne({ user: userId }).select('_id');
      if (!emp) {
        return res.status(404).json({ success: false, message: "Employer not found" });
      }
      filter.createdBy = emp._id;
    }
    // text filters
    if (keyword.trim()) {
      const regKeyword = { $regex: keyword.trim(), $options: 'i' }
      filter.$or = [
        { title: regKeyword },
        { description: regKeyword },
        { skills: { $in: [keyword.trim()] } }
      ];
    }
    if (location.trim()) {
      // match either type or city
      filter.$or = [
        { 'location.type': { $regex: location.trim(), $options: 'i' } },
        { 'location.city': { $regex: location.trim(), $options: 'i' } }
      ];
    }
    if (skillArr.length) {
      // filter.skills = { $in: skillArr };
      filter.$and = skillArr.map(skill => ({
        skills: { $in: [skill] }
      }));
    }

    filter.$and = [{ status: "live" }]

    // --- Count & page ---
    const totalCount = await Job.countDocuments({...filter, deadline: { $gte: new Date() }});
    const totalPages = Math.ceil(totalCount / pp) || 1;
    const jobs = await Job.find({...filter, deadline: { $gte: new Date() }})
      .skip((p - 1) * pp)
      .limit(pp)
      .lean()
      .populate('createdBy', 'companyName');

    return res.json({
      success: true,
      jobs,
      pagination: { currentPage: p, perPage: pp, totalPages, totalCount }
    });
  } catch (err) {
    console.error('Error in fetch-jobs:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble listing jobs; please try again later.'
    });
  }
});

// 1) List jobs
//    - Admin sees all; Employer sees only their own
router.get('/list-jobs', async (req, res) => {
  try {
    const { role, _id: userId } = req.session.user;

    // parse + validate pagination
    let { page = '1', perPage = '10' } = req.query;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const pp = Math.max(1, parseInt(perPage, 10) || 10);

    // if employer, filter to their jobs
    const filter = {};
    if (role === 'employer') {
      const emp = await Employer.findOne({ user: userId }).select('_id');
      if (!emp) {
        return res.status(404).json({ success: false, message: "Employer not found." });
      }
      filter.createdBy = emp._id;
    }

    // count + fetch page
    const totalCount = await Job.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / pp) || 1;

    const jobs = await Job.find(filter)
      .skip((p - 1) * pp)
      .limit(pp)
      .lean();

    return res.json({
      success: true,
      jobs,
      pagination: { currentPage: p, perPage: pp, totalPages, totalCount }
    });
  } catch (err) {
    console.error('Error in listing jobs:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble in listing jobs! please contact support team or try again later.'
    });
  }
});

router.get('/job-detail/:id', async (req, res) => {
  try {
    const id = req.params.id

    if(!id){
      return res.status(400).json({success: false, message: "Kindly provide a valid Job ID!"})
    }

    let filter = {
      _id: id
    }

    let fetchApplications = {}

    const userId = req.session?.user?._id
    if(userId){
      const fetchCandidate = await Candidate.findOne({user: new mongoose.Types.ObjectId(userId) })

      if(fetchCandidate){
        fetchApplications = await Applications.findOne({
          candidate: new mongoose.Types.ObjectId(fetchCandidate._id),
          job: new mongoose.Types.ObjectId(id)
        })
      }
    }

    const job = await Job.findOne(filter).lean().populate("createdBy");
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    return res.json({ success: true, job, fetchApplications });
  } catch (err) {
    console.log('Error in fetching job detail:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/update-job/:id', isEmployer, async (req, res) => {
  try {
    const jobId = req.params.id;
    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid job ID.' });
    }

    // 0) Parse nested JSON if strings
    let { title, description, skills, requirements,
      experience, salary, location,
      industry, employmentType, deadline, status } = req.body;

    if (typeof skills === 'string') skills = JSON.parse(skills);
    if (typeof requirements === 'string') requirements = JSON.parse(requirements);
    if (typeof experience === 'string') experience = JSON.parse(experience);
    if (typeof salary === 'string') salary = JSON.parse(salary);
    if (typeof location === 'string') location = JSON.parse(location);

    // 1) Validate inputs
    const errors = [];
    if (!title?.trim()) errors.push('title is required.');
    if (!description?.trim()) errors.push('description is required.');

    if (!Array.isArray(skills) || skills.length === 0)
      errors.push('Add at least one skill.');
    if (!Array.isArray(requirements) || requirements.length === 0)
      errors.push('Add at least one requirement.');

    if (!experience || typeof experience.min !== 'number' || typeof experience.max !== 'number')
      errors.push('experience.min and .max must be numbers.');
    else if (experience.max < experience.min)
      errors.push('experience.max must be ≥ experience.min.');

    if (!salary || typeof salary.min !== 'number' || typeof salary.max !== 'number')
      errors.push('salary.min and .max must be numbers.');
    else if (salary.max < salary.min)
      errors.push('salary.max must be ≥ salary.min.');

    if (!location || !isValidEnum(location.type, LOCATION_TYPES))
      errors.push(`location.type must be one of [${LOCATION_TYPES.join(', ')}].`);
    if (location.type === 'onsite' && !location.city?.trim())
      errors.push('location.city is required for onsite.');

    if (!industry?.trim()) errors.push('industry is required.');
    if (!isValidEnum(employmentType, EMPLOY_TYPES))
      errors.push(`employmentType must be one of [${EMPLOY_TYPES.join(', ')}].`);

    const dl = new Date(deadline);
    if (!deadline || isNaN(dl.getTime()))
      errors.push('Valid deadline is required.');
    // else if (dl < new Date())
    //   errors.push('deadline must be in the future.');

    if (!["live", "draft"].includes(status.toLowerCase()))
      errors.push('Status must be live or draft.');

    if (errors.length) {
      return res.status(400).json({ success: false, message: errors.join(' ') });
    }

    // 2) Ensure employer owns this job
    const employer = await Employer.findOne({ user: req.session.user._id }).select('_id');
    if (!employer) {
      return res.status(403).json({ success: false, message: 'Employer profile not found.' });
    }

    // 3) Build update object
    const update = {
      title: title.trim(),
      description: description.trim(),
      skills,
      requirements,
      experience: { min: experience.min, max: experience.max },
      salary: { min: salary.min, max: salary.max },
      location: { type: location.type, city: location.city?.trim() || '' },
      industry: industry.trim(),
      employmentType,
      deadline: dl,
      status
    };

    // 4) Update in DB
    const job = await Job.findOneAndUpdate(
      { _id: jobId, createdBy: employer._id },
      update,
      { new: true }
    ).lean();

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found or not owned by you.' });
    }

    return res.json({
      success: true,
      message: 'Job updated successfully.',
      job
    });
  }
  catch (err) {
    console.error('Error in updating job:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble in updating job! please contact support team or try again later.'
    });
  }
});

// Helper: compute new deadline (e.g. extend by 30 days)
function extendByDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// 2) Renew jobs (single or bulk)
router.post('/renew-jobs', isEmployer, async (req, res) => {
  try {
    let { ids } = req.body;
    if (typeof ids === 'string') ids = JSON.parse(ids);
    if (!Array.isArray(ids) || ids.some(id => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, message: 'Valid job IDs are required.' });
    }

    const userId = req.session.user._id;
    // Extend each qualifying job
    const newDeadline = extendByDays(30);
    await Job.updateMany(
      { _id: { $in: ids }, createdBy: userId },
      { $set: { status: 'live', deadline: newDeadline } }
    );

    // Return updated list
    const jobs = await Job.find({ createdBy: userId }).lean();
    return res.json({
      success: true,
      message: 'Selected job(s) renewed for another 30 days.',
      jobs
    });
  } catch (err) {
    console.log('Error in renewing jobs:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble in renewing jobs! please contact support team or try again later.'
    });
  }
});

// 3) Delete jobs (single or bulk)
router.post('/delete-jobs', isEmployer, async (req, res) => {
  try {
    let { ids } = req.body;
    if (typeof ids === 'string') ids = JSON.parse(ids);
    if (!Array.isArray(ids) || ids.some(id => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, message: 'Valid job IDs are required.' });
    }

    const userId = req.session.user._id;

    const employer = await Employer.findOne({ user: userId })

    const authRole = req.session.user.role

    if (!employer && authRole !== "admin") {
      return res.status(404).json({ success: false, message: "Employer data not found! Please contact Support team." })
    }

    let deleteJobs
    if (authRole === "employer") {
      deleteJobs = await Job.deleteMany({ _id: { $in: ids }, createdBy: employer._id });
    }
    else if (authRole === "admin") {
      deleteJobs = await Job.deleteMany({ _id: { $in: ids } });
    }
    else {
      return res.status(500).json({ success: false, message: "You don't have access to perform this action!" })
    }

    if (!deleteJobs) {
      return res.status(500).json({ success: false, message: "Failed to delete Jobs! Please contact Support team." })
    }

    return res.json({
      success: true,
      message: 'Selected job(s) deleted successfully.'
    });
  } catch (err) {
    console.log('Error in deleting jobs:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble in deleting jobs! please contact support team or try again later.'
    });
  }
});



// API for Candidate's Saved & Applied Jobs
router.post('/job-list', isAuth, async (req, res) => {
  try {
    const { page, pageNum = 1, perPage = 5 } = req.body;

    // 1) Validate
    if (!['applied', 'saved'].includes(page)) {
      return res.status(400).json({ success: false, message: 'page must be "applied" or "saved".' });
    }
    const p = parseInt(pageNum, 10);
    const pp = parseInt(perPage, 10);
    if (isNaN(p) || p < 1 || isNaN(pp) || pp < 1) {
      return res.status(400).json({ success: false, message: 'Invalid pagination parameters.' });
    }

    // 2) Find candidate
    const candidate = await Candidate.findOne({ user: req.session.user._id }).select('_id');
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate profile not found.' });
    }

    // 3) Filter & count
    let filter = { candidate: candidate._id };

    if (page === "applied") {
      filter.applicationStatus = true
    }
    else if (page === "saved") {
      filter.saveStatus = true
    }

    const totalCount = await Applications.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / pp) || 1;

    // 4) Fetch paginated, populated
    const apps = await Applications.find(filter)
      .skip((p-1)*pp)
      .limit(pp)
      .sort({ hiringStatus: 1, updatedAt: -1 })
      .populate({
        path: 'job',
        select: 'title skills salary location createdBy',
        populate: { path: 'createdBy', select: 'companyName' }
      })
      .lean();

    // 5) Return
    return res.json({
      success: true,
      jobs: apps.map(a => ({ id: a._id, _id: a.job._id, hiringStatus: a.hiringStatus, ...a.job })),
      pagination: { currentPage: p, perPage: pp, totalPages, totalCount }
    });
  }
  catch (err) {
    console.log('Error in fetching job list:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble in fetching job list! please contact support team or try again later.'
    });
  }
})

module.exports = router;
