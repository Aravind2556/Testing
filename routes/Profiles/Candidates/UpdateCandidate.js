const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose')
const Candidate = require('../../../models/Candidate');
const getNextCandidateID = require("../../../utils/getNextCandidateID")
const capitalizeFirstLetter = require("../../../utils/IntialLetterCaps")
const toTitleCase = require("../../../utils/toTitleCase")
const router = express.Router();


// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // use different prefixes based on fieldname
    const prefix = file.fieldname === 'resume' ? 'resume' : 'profilePic';
    cb(null, `${prefix}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // resume => allow docs/pdf, profilePic => only images
    if (file.fieldname === 'resume') {
      if (!/\.(pdf|docx)$/i.test(file.originalname))
        return cb(new Error('Only PDF/DOCX allowed for resume'), false);
    } else {
      if (!file.mimetype.startsWith('image/'))
        return cb(new Error('Only images allowed for profilePic'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // max 5MB
});

// helper validators
const isValidEmail = email =>
  /^\S+@\S+\.\S+$/.test(email);
const isValidPhone = num =>
  /^\d{10}$/.test(String(num));
const isValidEnum = (val, arr) =>
  arr.includes(String(val).toLowerCase());
const isNumeric = v => !isNaN(v);
const isValidDate = d => !isNaN(Date.parse(d));
const isValidURL = u => /^https?:\/\/\S+$/.test(u);

// allowed enums
const GENDERS = ['female', 'male', 'other'];
const MARITALS = ['single', 'married', 'divorced', 'widowed'];
const PROFICIENCY = ['beginner', 'intermediate', 'advanced'];

router.post('/update-personal-details', upload.single('profilePic'), async (req, res) => {
  try {
    const { firstName, middleName, lastName, applicantName, emailAddress, alternateEmailAddress, phoneNumber, alternatePhoneNumber, dateOfBirth, gender, maritalStatus, disability, presentAddress, permanentAddress, languages, _id } = req.body;

    let phone, altPhone, disab, presAddr, permAddr, langs;
    try {
      phone = typeof phoneNumber === 'string' ? JSON.parse(phoneNumber) : phoneNumber;
      altPhone = typeof alternatePhoneNumber === 'string' ? JSON.parse(alternatePhoneNumber) : alternatePhoneNumber;
      disab = typeof disability === 'string' ? JSON.parse(disability) : disability;
      presAddr = typeof presentAddress === 'string' ? JSON.parse(presentAddress) : presentAddress;
      permAddr = typeof permanentAddress === 'string' ? JSON.parse(permanentAddress) : permanentAddress;
      langs = typeof languages === 'string' ? JSON.parse(languages) : languages;
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Malformed JSON in one of the nested fields.' });
    }

    // 2) Validate required & formats
    const errors = [];

    if (!firstName || firstName.trim().length < 3)
      errors.push('firstName must be at least 3 characters.');
    if (!lastName || lastName.trim().length < 1)
      errors.push('lastName is required.');
    if (!applicantName || applicantName.trim().length < 3)
      errors.push('applicantName must be at least 3 characters.');

    if (!emailAddress || !isValidEmail(emailAddress))
      errors.push('Valid emailAddress is required.');
    if (alternateEmailAddress && !isValidEmail(alternateEmailAddress))
      errors.push('alternateEmailAddress is invalid.');

    if (!phone || !isValidPhone(phone.number))
      errors.push('phoneNumber.number must be 10 digits.');
    if (phone.countryCode && (String(phone.countryCode).length > 3 || isNaN(phone.countryCode)))
      errors.push('phoneNumber.countryCode must be numeric up to 3 digits.');

    if (altPhone?.number && !isValidPhone(altPhone.number))
      errors.push('alternatePhoneNumber.number must be 10 digits if provided.');
    if (altPhone?.countryCode && (String(altPhone.countryCode).length > 3 || isNaN(altPhone.countryCode)))
      errors.push('alternatePhoneNumber.countryCode must be numeric up to 3 digits.');

    if (!dateOfBirth || isNaN(Date.parse(dateOfBirth)))
      errors.push('Valid dateOfBirth is required.');

    if (!isValidEnum(gender, GENDERS))
      errors.push(`gender must be one of [${GENDERS.join(', ')}].`);
    if (!isValidEnum(maritalStatus, MARITALS))
      errors.push(`maritalStatus must be one of [${MARITALS.join(', ')}].`);

    if (disab.isDisabled && (!disab.desc || disab.desc.trim().length < 5))
      errors.push('disability.desc is required when isDisabled=true and must be at least 5 characters.');

    // address validators
    const addrFields = ['addressLine1', 'city', 'district', 'state', 'country'];
    addrFields.forEach(f => {
      if (!presAddr[f] || !presAddr[f].toString().trim()) errors.push(`presentAddress.${f} is required.`);
      if (!permAddr[f] || !permAddr[f].toString().trim()) errors.push(`permanentAddress.${f} is required.`);
    });
    ['zipCode'].forEach(f => {
      if (!presAddr.zipCode || isNaN(presAddr.zipCode)) errors.push('presentAddress.zipCode must be numeric.');
      if (!permAddr.zipCode || isNaN(permAddr.zipCode)) errors.push('permanentAddress.zipCode must be numeric.');
    });

    // languages array
    if (!Array.isArray(langs))
      errors.push('languages must be an array.');
    else {
      langs.forEach((lang, i) => {
        if (!lang.name) errors.push(`languages[${i}].name is required.`);
        if (!isValidEnum(lang.proficiency, PROFICIENCY))
          errors.push(`languages[${i}].proficiency must be one of [${PROFICIENCY.join(', ')}].`);
        ['read', 'write', 'speak'].forEach(flag => {
          if (typeof lang[flag] !== 'boolean')
            errors.push(`languages[${i}].${flag} must be true or false.`);
        });
      });
    }

    if (errors.length) {
      let errorStr = ""
      errors.forEach(err => {
        if (err) {
          errorStr += err
        }
      })
      return res.status(400).json({ success: false, message: errorStr });
    }

    // 3) Build update object
    const update = {
      firstName: capitalizeFirstLetter(firstName),
      middleName: middleName ? capitalizeFirstLetter(middleName) : '',
      lastName: capitalizeFirstLetter(lastName),
      applicantName: toTitleCase(applicantName),
      emailAddress: emailAddress.toLowerCase(),
      alternateEmailAddress: alternateEmailAddress?.toLowerCase() || '',
      phoneNumber: {
        countryCode: +phone.countryCode,
        number: +phone.number
      },
      alternatePhoneNumber: {
        countryCode: +altPhone.countryCode || undefined,
        number: +altPhone.number || undefined
      },
      dateOfBirth: new Date(dateOfBirth),
      gender: gender.toLowerCase(),
      maritalStatus: maritalStatus.toLowerCase(),
      disability: {
        isDisabled: disab.isDisabled,
        desc: disab.desc?.trim() || ''
      },
      presentAddress: {
        ...presAddr,
        zipCode: +presAddr.zipCode
      },
      permanentAddress: {
        ...permAddr,
        zipCode: +permAddr.zipCode
      },
      languages: langs,
      updatedOn: new Date()
    };
    // if a new file was uploaded, set profilePicLink
    if (req.file) {
      update.profilePicLink = `/uploads/${req.file.filename}`;
    }


    // 4) Update in DB
    let candidate = await Candidate.findOneAndUpdate(
      { user: new mongoose.Types.ObjectId(_id) },
      update,
      { new: true }
    );
    if (!candidate) {

      update.candidateID = await getNextCandidateID()
      update.user = req.session.user._id

      // Create new candidate
      candidate = await Candidate.create(update);
      
      if(!candidate){
        return res
          .status(404)
          .json({ success: false, message: 'Candidate not found!' });
      }

      return res.status(201).json({
        success: true,
        message: "Successfully updated the document.",
        candidate
      });
    }

    return res.json({ success: true, message: "Successfully updated Candidate profile!", candidate });
  }
  catch (err) {
    console.log("Error in updating personal details:", err)
    return res.status(404).json({ success: false, message: "Trouble in updating personal details! Please contact support team." })
  }
})

router.post('/update-preference-details', upload.single('resume'), async (req, res) => {
  try {
    // 1) Extract & parse
    let { _id, profileSummary, experience, currentCTC, expectedCTC, hiringMode, noticePeriod, negotiableNoticePeriod, noticePeriodServingDate, lwd, preferredJob, preferredLocation, relocation } = req.body;

    let exp, curr, expect, jobs, locs;
    try {
      exp = typeof experience === 'string' ? JSON.parse(experience) : experience;
      curr = typeof currentCTC === 'string' ? JSON.parse(currentCTC) : currentCTC;
      expect = typeof expectedCTC === 'string' ? JSON.parse(expectedCTC) : expectedCTC;
      jobs = typeof preferredJob === 'string' ? JSON.parse(preferredJob) : preferredJob;
      locs = typeof preferredLocation === 'string' ? JSON.parse(preferredLocation) : preferredLocation;
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, message: 'Malformed JSON in nested fields.' }); 
    }

    let currentCTCAmount = curr.amount
    let expectedCTCAmount = expect.amount
    if (currentCTCAmount && typeof currentCTCAmount === "string"){
      currentCTCAmount = Number(curr.amount)
    }
    if (expectedCTCAmount && typeof expectedCTCAmount === "string") {
      expectedCTCAmount = Number(expect.amount)
    }


    // 2) Validate
    const errors = [];
    // _id
    if(!_id){
      errors.push("_id is required!")
    }
    // experience
    if (!exp || typeof exp.year !== 'number' || exp.year < 0)
      errors.push('experience.year must be a non‐negative number.');
    if (!exp || typeof exp.month !== 'number' || exp.month < 0)
      errors.push('experience.month must be a non‐negative number.');
    // CTC
    if (!curr || typeof currentCTCAmount !== 'number' || currentCTCAmount < 0)
      errors.push('currentCTC.amount must be a non‐negative number.');
    if (!expect || typeof expectedCTCAmount !== 'number' || expectedCTCAmount < 0)
      errors.push('expectedCTC.amount must be a non‐negative number.');
    // enums & dates
    if (!hiringMode) errors.push('hiringMode is required.');
    if (!noticePeriod) errors.push('noticePeriod is required.');
    if (!negotiableNoticePeriod) errors.push('negotiableNoticePeriod is required.');
    if (!noticePeriodServingDate || !isValidDate(noticePeriodServingDate))
      errors.push('Valid noticePeriodServingDate is required.');
    if (!lwd || !isValidDate(lwd)) errors.push('Valid lwd is required.');
    // preferences
    if (!Array.isArray(jobs) || jobs.length === 0)
      errors.push('Add at least one preferredJob.');
    if (!Array.isArray(locs) || locs.length === 0)
      errors.push('Add at least one preferredLocation.');
    // relocation
    if (typeof (relocation === 'string' ? JSON.parse(relocation) : relocation) !== 'boolean') {

      if (relocation === "false" || relocation === "true") {
        relocation = (relocation === "true") ? true : false
      }
      else {
        errors.push('relocation must be true or false.');
      }

    }

    // resume
    if (!req.file && !req.body.resumeLink) {
      console.log(req.file, req.body.resumeLink)
      errors.push('Please upload a resume.');
    }


    if (errors.length) {
      return res.status(400).json({ success: false, message: errors.join(' ') });
    }

    // 3) Build update
    const update = {
      profileSummary: profileSummary,
      experience: {
        year: exp.year,
        month: exp.month
      },
      currentCTC: {
        currency: curr.currency || 'inr',
        amount: currentCTCAmount
      },
      expectedCTC: {
        currency: expect.currency || 'inr',
        amount: expectedCTCAmount
      },
      hiringMode,
      noticePeriod,
      negotiableNoticePeriod,
      noticePeriodServingDate: new Date(noticePeriodServingDate),
      lwd: new Date(lwd),
      preferredJob: jobs,
      preferredLocation: locs,
      relocation: (relocation === 'true' || relocation === true),
      resumeAvailable: true,
      updatedOn: new Date()
    };

    if (req.file) {
      update.resumeLink = `/uploads/${req.file.filename}`;
    }


    // 4) Persist
    let candidate = await Candidate.findOneAndUpdate(
      { user: new mongoose.Types.ObjectId(_id) },
      update,
      { new: true }
    );
    if (!candidate) {

      update.candidateID = await getNextCandidateID()
      update.user = _id

      candidate = await Candidate.create(update);

      if(!candidate){
        return res
          .status(404)
          .json({ success: false, message: 'Candidate not found!' });
      }

      return res.status(201).json({
        success: true,
        message: "Successfully updated the document.",
        candidate
      });

    }

    return res.json({
      success: true,
      message: 'Preferences updated successfully.',
      candidate
    });
  } catch (err) {
    console.error('Error in update-preference-details:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' });
  }
}
);

// POST /create-skill
router.post('/create-skill', async (req, res) => {
  try {
    const { type, tempSkill, userId } = req.body;

    // 1) Validate inputs
    if (!['primary', 'skill'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be "primary" or "skill".' });
    }
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Valid userId is required.' });
    }
    const { skill, experience, lastUsed, version } = tempSkill;
    if (!skill || typeof skill !== 'string') {
      return res.status(400).json({ success: false, message: 'tempSkill.skill must be a non-empty string.' });
    }
    if (
      (experience.year && typeof experience.year !== 'number') ||
      (experience.month && typeof experience.month !== 'number')
    ) {
      return res.status(400).json({
        success: false,
        message: 'tempSkill.experience.year and .month must be numbers.'
      });
    }
    if (lastUsed == null || isNaN(Number(lastUsed))) {
      return res.status(400).json({ success: false, message: 'tempSkill.lastUsed must be a number.' });
    }
    if (version == null) {
      return res.status(400).json({ success: false, message: 'tempSkill.version must be a required.' });
    }

    // 2) Build the new subdoc
    const newSkill = {
      ...(type === 'primary'
        ? { primarySkill: skill.trim() }
        : { skill: skill.trim() }),
      experience: {
        year: experience.year,
        month: experience.month
      },
      lastUsed: Number(lastUsed),
      version: Number(version)
    };


    // 3) Push into the correct array
    const arrayField = type === 'primary' ? 'primarySkills' : 'skills';


    let candidate = await Candidate.findOneAndUpdate(
      { user: new mongoose.Types.ObjectId(userId) },
      { $push: { [arrayField]: newSkill } },
      { new: true, select: arrayField }
    );
    if (!candidate) {

      const candidateID = await getNextCandidateID()

      const insertCandidate = new Candidate({
        candidateID: candidateID,
        user: new mongoose.Types.ObjectId(userId),
        emailAddress: req.session.user.email,
        [arrayField]: [newSkill]
      })

      candidate = await insertCandidate.save()

      if (!candidate) {
        return res
          .status(404)
          .json({ success: false, message: 'Failed to save Candidate!' });
      }
    }

    // 4) Return the updated array
    return res.json({
      success: true,
      message: `${type === 'primary' ? 'Primary' : ''} Skill added successfully.`,
      skill: candidate[arrayField]
    });
  } catch (err) {
    console.error('Error in create-skill:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble creating skill — please try again later or contact support.'
    });
  }
});


router.post('/update-skill', async (req, res) => {
  try {
    const { type, tempSkill, userId } = req.body;

    // 1) Validate inputs
    if (!['primary', 'skill'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be "primary" or "skill".' });
    }
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Valid userId is required.' });
    }
    if (!mongoose.isValidObjectId(tempSkill.id)) {
      return res.status(400).json({ success: false, message: 'Valid skill _id is required.' });
    }
    const { skill, experience, lastUsed, version } = tempSkill;

    if (!skill || typeof skill !== 'string') {
      return res.status(400).json({ success: false, message: 'tempSkill.skill must be a non-empty string.' });
    }
    if (
      (experience.month && experience.year) && 
      (typeof experience.year !== 'number' ||
      typeof experience.month !== 'number')
    ) {
      return res.status(400).json({
        success: false,
        message: 'tempSkill.experience.year and .month must be numbers.'
      });
    }
    if (lastUsed == null || isNaN(Number(lastUsed))) {
      return res.status(400).json({ success: false, message: 'tempSkill.lastUsed must be a number.' });
    }
    if (version == null ) {
      return res.status(400).json({ success: false, message: 'tempSkill.version must be a required.' });
    }

    // 2) Determine which array to update
    const arrayField = type === 'primary' ? 'primarySkills' : 'skills';

    // 3) Perform the update with positional operator
    const updateOps = {
      [`${arrayField}.$.skill`]: skill.trim(),
      [`${arrayField}.$.experience`]: {
        year: experience.year,
        month: experience.month
      },
      [`${arrayField}.$.lastUsed`]: Number(lastUsed),
      [`${arrayField}.$.version`]: Number(version)
    };

    const updatedCandidate = await Candidate.findOneAndUpdate(
      {
        user: userId,
        [`${arrayField}._id`]: tempSkill.id
      },
      { $set: updateOps },
      { new: true, select: arrayField }
    );

    if (!updatedCandidate) {
      return res.status(404).json({ success: false, message: 'Candidate or skill not found.' });
    }

    // 4) Return the updated array
    return res.json({
      success: true,
      message: `${type === 'primary' ? 'Primary' : ''} Skill updated successfully.`,
      skill: updatedCandidate[arrayField]
    });
  }
  catch (err) {
    console.error('Error in update-skill:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble updating skill — please try again later or contact support.'
    });
  }
});

router.post('/delete-skill', async (req, res) => {
  try {
    const { type, id, userId } = req.body;

    // 1) Basic validation
    if (!['primary', 'skill'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid type: must be "primary" or "skill".' });
    }
    if (!id) {
      return res.status(400).json({ success: false, message: 'Skill id is required.' });
    }
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Valid userId is required.' });
    }

    // 2) Determine which array to update
    const arrayField = type === 'primary' ? 'primarySkills' : 'skills';

    // 3) Pull out the subdocument with _id = id
    const updatedCandidate = await Candidate.findOneAndUpdate(
      { user: userId },
      { $pull: { [arrayField]: { _id: id } } },
      { new: true, select: arrayField }
    );

    if (!updatedCandidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found.' });
    }

    // 4) Return the updated array
    return res.json({
      success: true,
      message: `${type === 'primary' ? 'Primary' : ''} Skill removed successfully.`,
      skill: updatedCandidate[arrayField]
    });
  }
  catch (err) {
    console.error('Error in delete-skill:', err);
    return res.status(500).json({
      success: false,
      message: 'Trouble deleting skill — please try again later or contact support.'
    });
  }
});

// ——— Create Experience ———
router.post('/create-experience', async (req, res) => {
  try {
    const { userId, tempExp } = req.body;
    console.log("userid",userId,tempExp)
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId is required.' });

    // Destructure & validate
    const { jobTitle, employer, periodFrom, periodTo, isOngoing, location, description } = tempExp || {};
    const errors = [];
    if (!jobTitle || !jobTitle.trim()) errors.push('jobTitle is required.');
    if (!employer || !employer.trim()) errors.push('employer is required.');
    if (!periodFrom || !isValidDate(periodFrom)) errors.push('Valid periodFrom is required.');
    if (!isOngoing && (!periodTo || !isValidDate(periodTo)))
      errors.push('Valid periodTo is required when not ongoing.');
    if (periodFrom && periodTo && !isOngoing) {
      if (new Date(periodTo) < new Date(periodFrom))
        errors.push('periodTo cannot be before periodFrom.');
    }
    if (typeof isOngoing !== 'boolean')
      errors.push('isOngoing must be a boolean.');

    if (errors.length)
      return res.status(400).json({ success: false, message: errors.join(' ') });

    // Build subdocument
    const newExp = {
      jobTitle: jobTitle.trim(),
      employer: employer.trim(),
      periodFrom: new Date(periodFrom),
      ...(isOngoing
        ? { isOngoing: true }
        : { periodTo: new Date(periodTo), isOngoing: false }),
      location: location?.trim() || '',
      description: description?.trim() || ''
    };

    let candidate = await Candidate.findOneAndUpdate(
      { user: new mongoose.Types.ObjectId(userId) },
      { $push: { experiences: newExp } },
      { new: true, select: 'experiences' }
    );
    if (!candidate) {

      const candidateID = await getNextCandidateID()

      const insertCandidate = new Candidate({
        candidateID: candidateID,
        user: new mongoose.Types.ObjectId(userId),
        emailAddress: req.session.user.email,
        experiences: [newExp]
      })

      const saveCandidate = await insertCandidate.save()

      if (!saveCandidate){
        return res
          .status(404)
          .json({ success: false, message: 'Failed to save Candidate!' });
      }

    }
    return res.json({
      success: true,
      message: 'Experience added successfully.'      
    });
  } catch (err) {
    console.error('Error in create-experience:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ——— Update Experience ———
router.post('/update-experience', async (req, res) => {
  try {
    const { userId, tempExp } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId is required.' });
    if (!tempExp?.id || !mongoose.isValidObjectId(tempExp.id))
      return res.status(400).json({ success: false, message: 'Valid experience id is required.' });

    // Destructure & validate
    const { jobTitle, employer, periodFrom, periodTo, isOngoing, location, description, id } = tempExp;
    const errors = [];
    if (!jobTitle || !jobTitle.trim()) errors.push('jobTitle is required.');
    if (!employer || !employer.trim()) errors.push('employer is required.');
    if (!periodFrom || !isValidDate(periodFrom)) errors.push('Valid periodFrom is required.');
    if (!isOngoing && (!periodTo || !isValidDate(periodTo)))
      errors.push('Valid periodTo is required when not ongoing.');
    if (periodFrom && periodTo && !isOngoing) {
      if (new Date(periodTo) < new Date(periodFrom))
        errors.push('periodTo cannot be before periodFrom.');
    }
    if (typeof isOngoing !== 'boolean')
      errors.push('isOngoing must be a boolean.');

    if (errors.length)
      return res.status(400).json({ success: false, message: errors.join(' ') });

    // Build update operations
    const arrayField = 'experiences';
    const setOps = {
      [`${arrayField}.$.jobTitle`]: jobTitle.trim(),
      [`${arrayField}.$.employer`]: employer.trim(),
      [`${arrayField}.$.periodFrom`]: new Date(periodFrom),
      [`${arrayField}.$.isOngoing`]: isOngoing,
      ...(isOngoing
        ? {}
        : { [`${arrayField}.$.periodTo`]: new Date(periodTo) }),
      [`${arrayField}.$.location`]: location?.trim() || '',
      [`${arrayField}.$.description`]: description?.trim() || ''
    };

    const updated = await Candidate.findOneAndUpdate(
      {
        user: userId,
        [`experiences._id`]: id
      },
      { $set: setOps },
      { new: true, select: 'experiences' }
    );
    if (!updated)
      return res.status(404).json({ success: false, message: 'Candidate or experience not found.' });

    return res.json({
      success: true,
      message: 'Experience updated successfully.',
      experiences: updated.experiences
    });
  } catch (err) {
    console.error('Error in update-experience:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ——— Delete Experience ———
router.post('/delete-experience', async (req, res) => {
  try {
    const { userId, id } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId is required.' });
    if (!id || !mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: 'Valid experience id is required.' });

    const updated = await Candidate.findOneAndUpdate(
      { user: userId },
      { $pull: { experiences: { _id: id } } },
      { new: true, select: 'experiences' }
    );
    if (!updated)
      return res.status(404).json({ success: false, message: 'Candidate not found.' });

    return res.json({
      success: true,
      message: 'Experience deleted successfully.',
      experiences: updated.experiences
    });
  } catch (err) {
    console.error('Error in delete-experience:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});


// ——— Create Education ———
router.post('/create-education', async (req, res) => {
  try {
    const { userId, tempEdu } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId is required.' });

    // Destructure and validate
    const {
      institutionName,
      courseCategory,
      courseType,
      courseName,
      startDate,
      endDate,
      isOngoing,
      gpa,
      city,
      state,
      country,
      description
    } = tempEdu || {};

    const errors = [];
    if (!institutionName?.trim()) errors.push('institutionName is required.');
    if (!courseName?.trim()) errors.push('courseName is required.');
    if (!startDate || !isValidDate(startDate)) errors.push('Valid startDate is required.');
    if (!isOngoing && (!endDate || !isValidDate(endDate)))
      errors.push('Valid endDate is required when not ongoing.');
    if (startDate && endDate && !isOngoing) {
      if (new Date(endDate) < new Date(startDate))
        errors.push('endDate cannot be before startDate.');
    }
    if (gpa != null && (isNaN(gpa) || gpa < 0)) errors.push('gpa must be a non-negative number.');
    if (!city?.trim()) errors.push('city is required.');
    if (!state?.trim()) errors.push('state is required.');
    if (!country?.trim()) errors.push('country is required.');

    if (errors.length)
      return res.status(400).json({ success: false, message: errors.join(' ') });

    // Build new subdoc
    const newEdu = {
      institutionName: institutionName.trim(),
      courseCategory: courseCategory?.trim() || '',
      courseType: courseType?.trim() || '',
      courseName: courseName.trim(),
      startDate: new Date(startDate),
      isOngoing: Boolean(isOngoing),
      ...(isOngoing ? {} : { endDate: new Date(endDate) }),
      gpa: gpa != null ? Number(gpa) : undefined,
      city: city.trim(),
      state: state.trim(),
      country: country.trim(),
      description: description?.trim() || ''
    };

    // Push into educations
    const updated = await Candidate.findOneAndUpdate(
      { user: userId },
      { $push: { educations: newEdu } },
      { new: true, select: 'educations' }
    );
    if (!updated){

      const candidateID = await getNextCandidateID()

      const insertCandidate = new Candidate({
        candidateID: candidateID,
        user: new mongoose.Types.ObjectId(userId),
        emailAddress: req.session.user.email,
        educations: [newEdu]
      })


      const saveCandidate = await insertCandidate.save()

      if (!saveCandidate) {
        return res
          .status(404)
          .json({ success: false, message: 'Failed to save Candidate!' });
      }

    }

    return res.json({
      success: true,
      message: 'Education added successfully.',
      educations: updated.educations
    });

  } catch (err) {
    console.error('Error in create-education:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ——— Update Education ———
router.post('/update-education', async (req, res) => {
  try {
    const { userId, tempEdu } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId is required.' });
    if (!tempEdu?.id || !mongoose.isValidObjectId(tempEdu.id))
      return res.status(400).json({ success: false, message: 'Valid education id is required.' });

    // Destructure and validate
    const {
      id,
      institutionName,
      courseCategory,
      courseType,
      courseName,
      startDate,
      endDate,
      isOngoing,
      gpa,
      city,
      state,
      country,
      description
    } = tempEdu;

    const errors = [];
    if (!institutionName?.trim()) errors.push('institutionName is required.');
    if (!courseName?.trim()) errors.push('courseName is required.');
    if (!startDate || !isValidDate(startDate)) errors.push('Valid startDate is required.');
    if (!isOngoing && (!endDate || !isValidDate(endDate)))
      errors.push('Valid endDate is required when not ongoing.');
    if (startDate && endDate && !isOngoing) {
      if (new Date(endDate) < new Date(startDate))
        errors.push('endDate cannot be before startDate.');
    }
    if (gpa != null && (isNaN(gpa) || gpa < 0)) errors.push('gpa must be a non-negative number.');
    if (!city?.trim()) errors.push('city is required.');
    if (!state?.trim()) errors.push('state is required.');
    if (!country?.trim()) errors.push('country is required.');

    if (errors.length)
      return res.status(400).json({ success: false, message: errors.join(' ') });

    // Build $set operations
    const setOps = {
      'educations.$.institutionName': institutionName.trim(),
      'educations.$.courseCategory': courseCategory?.trim() || '',
      'educations.$.courseType': courseType?.trim() || '',
      'educations.$.courseName': courseName.trim(),
      'educations.$.startDate': new Date(startDate),
      'educations.$.isOngoing': Boolean(isOngoing),
      ...(isOngoing
        ? {}
        : { 'educations.$.endDate': new Date(endDate) }
      ),
      'educations.$.gpa': gpa != null ? Number(gpa) : undefined,
      'educations.$.city': city.trim(),
      'educations.$.state': state.trim(),
      'educations.$.country': country.trim(),
      'educations.$.description': description?.trim() || ''
    };

    const updated = await Candidate.findOneAndUpdate(
      {
        user: userId,
        'educations._id': id
      },
      { $set: setOps },
      { new: true, select: 'educations' }
    );
    if (!updated)
      return res.status(404).json({ success: false, message: 'Candidate or education not found.' });

    return res.json({
      success: true,
      message: 'Education updated successfully.',
      educations: updated.educations
    });
  } catch (err) {
    console.error('Error in update-education:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ——— Delete Education ———
router.post('/delete-education', async (req, res) => {
  try {
    const { userId, id } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId is required.' });
    if (!id || !mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: 'Valid education id is required.' });

    const updated = await Candidate.findOneAndUpdate(
      { user: userId },
      { $pull: { educations: { _id: id } } },
      { new: true, select: 'educations' }
    );
    if (!updated)
      return res.status(404).json({ success: false, message: 'Candidate not found.' });

    return res.json({
      success: true,
      message: 'Education deleted successfully.',
      educations: updated.educations
    });
  } catch (err) {
    console.error('Error in delete-education:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});


// ——— Certifications ———

// Create certification
router.post('/create-certification', async (req, res) => {
  try {
    const { userId, tempItem } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId required.' });

    const {
      certificationName,
      organization,
      periodFrom,
      periodTo,
      location,
      description,
      link
    } = tempItem || {};

    const errors = [];
    if (!certificationName?.trim()) errors.push('certificationName is required.');
    if (!organization?.trim()) errors.push('organization is required.');
    if (!periodFrom || !isValidDate(periodFrom))
      errors.push('Valid periodFrom is required.');
    if (!periodTo || !isValidDate(periodTo))
      errors.push('Valid periodTo is required.');
    if (new Date(periodTo) < new Date(periodFrom))
      errors.push('periodTo cannot be before periodFrom.');
    if (link && (!link?.trim() || !isValidURL(link)))
      errors.push('Valid link (https://...) is required.');

    if (errors.length)
      return res.status(400).json({ success: false, message: errors.join(' ') });

    const newCert = {
      certificationName: certificationName.trim(),
      organization: organization.trim(),
      periodFrom: new Date(periodFrom),
      periodTo: new Date(periodTo),
      location: location?.trim() || '',
      description: description?.trim() || '',
      link: link.trim()
    };

    const updated = await Candidate.findOneAndUpdate(
      { user: userId },
      { $push: { certifications: newCert } },
      { new: true, select: 'certifications' }
    );
    if (!updated){
      const candidateID = await getNextCandidateID()

      const insertCandidate = new Candidate({
        candidateID: candidateID,
        user: new mongoose.Types.ObjectId(userId),
        emailAddress: req.session.user.email,
        certifications: [newCert]
      })


      const saveCandidate = await insertCandidate.save()

      if (!saveCandidate) {
        return res
          .status(404)
          .json({ success: false, message: 'Failed to save Candidate!' });
      }
    }

    res.json({
      success: true,
      message: 'Certification added.',
      certifications: updated.certifications
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Update certification
router.post('/update-certification', async (req, res) => {
  try {
    const { userId, tempItem } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId required.' });
    if (!tempItem?.id || !mongoose.isValidObjectId(tempItem.id))
      return res.status(400).json({ success: false, message: 'Valid certification id required.' });

    const {
      id, certificationName, organization,
      periodFrom, periodTo, location,
      description, link
    } = tempItem;

    const errors = [];
    if (!certificationName?.trim()) errors.push('certificationName is required.');
    if (!organization?.trim()) errors.push('organization is required.');
    if (!periodFrom || !isValidDate(periodFrom))
      errors.push('Valid periodFrom is required.');
    if (!periodTo || !isValidDate(periodTo))
      errors.push('Valid periodTo is required.');
    if (new Date(periodTo) < new Date(periodFrom))
      errors.push('periodTo cannot be before periodFrom.');
    if (link && (!link?.trim() || !isValidURL(link)))
      errors.push('Valid link is required.');

    if (errors.length)
      return res.status(400).json({ success: false, message: errors.join(' ') });

    const setOps = {
      'certifications.$.certificationName': certificationName.trim(),
      'certifications.$.organization': organization.trim(),
      'certifications.$.periodFrom': new Date(periodFrom),
      'certifications.$.periodTo': new Date(periodTo),
      'certifications.$.location': location?.trim() || '',
      'certifications.$.description': description?.trim() || '',
      'certifications.$.link': link.trim()
    };

    const updated = await Candidate.findOneAndUpdate(
      { user: userId, 'certifications._id': id },
      { $set: setOps },
      { new: true, select: 'certifications' }
    );
    if (!updated)
      return res.status(404).json({ success: false, message: 'Not found.' });

    res.json({
      success: true,
      message: 'Certification updated.',
      certifications: updated.certifications
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Delete certification
router.post('/delete-certification', async (req, res) => {
  try {
    const { userId, id } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId required.' });
    if (!id || !mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: 'Valid certification id required.' });

    const updated = await Candidate.findOneAndUpdate(
      { user: userId },
      { $pull: { certifications: { _id: id } } },
      { new: true, select: 'certifications' }
    );
    if (!updated)
      return res.status(404).json({ success: false, message: 'Candidate not found.' });

    res.json({
      success: true,
      message: 'Certification deleted.',
      certifications: updated.certifications
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});


// ——— Projects ———

// Create project
router.post('/create-project', async (req, res) => {
  try {
    const { userId, tempItem } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId required.' });

    const {
      projectName,
      clientName,
      periodFrom,
      periodTo,
      location,
      description,
      role
    } = tempItem || {};

    const errors = [];
    if (!projectName?.trim()) errors.push('projectName is required.');
    if (!periodFrom || !isValidDate(periodFrom))
      errors.push('Valid periodFrom is required.');
    if (!periodTo || !isValidDate(periodTo))
      errors.push('Valid periodTo is required.');
    if (new Date(periodTo) < new Date(periodFrom))
      errors.push('periodTo cannot be before periodFrom.');
    if (!role?.trim()) errors.push('role is required.');

    if (errors.length)
      return res.status(400).json({ success: false, message: errors.join(' ') });

    const newProj = {
      projectName: projectName.trim(),
      clientName: clientName?.trim() || "",
      periodFrom: new Date(periodFrom),
      periodTo: new Date(periodTo),
      location: location?.trim() || '',
      description: description?.trim() || '',
      role: role.trim()
    };

    const updated = await Candidate.findOneAndUpdate(
      { user: userId },
      { $push: { projects: newProj } },
      { new: true, select: 'projects' }
    );
    if (!updated) {
      const candidateID = await getNextCandidateID()

      const insertCandidate = new Candidate({
        candidateID: candidateID,
        user: new mongoose.Types.ObjectId(userId),
        emailAddress: req.session.user.email,
        projects: [newProj]
      })


      const saveCandidate = await insertCandidate.save()

      if (!saveCandidate) {
        return res
          .status(404)
          .json({ success: false, message: 'Failed to save Candidate!' });
      }
    }

    res.json({ success: true, message: 'Project added.', projects: updated.projects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Update project
router.post('/update-project', async (req, res) => {
  try {
    const { userId, tempItem } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId required.' });
    if (!tempItem?.id || !mongoose.isValidObjectId(tempItem.id))
      return res.status(400).json({ success: false, message: 'Valid project id required.' });

    const {
      id, projectName, clientName,
      periodFrom, periodTo, location,
      description, role
    } = tempItem;

    const errors = [];
    if (!projectName?.trim()) errors.push('projectName is required.');
    if (!clientName?.trim()) errors.push('clientName is required.');
    if (!periodFrom || !isValidDate(periodFrom))
      errors.push('Valid periodFrom is required.');
    if (!periodTo || !isValidDate(periodTo))
      errors.push('Valid periodTo is required.');
    if (new Date(periodTo) < new Date(periodFrom))
      errors.push('periodTo cannot be before periodFrom.');
    if (!role?.trim()) errors.push('role is required.');

    if (errors.length)
      return res.status(400).json({ success: false, message: errors.join(' ') });

    const setOps = {
      'projects.$.projectName': projectName.trim(),
      'projects.$.clientName': clientName.trim(),
      'projects.$.periodFrom': new Date(periodFrom),
      'projects.$.periodTo': new Date(periodTo),
      'projects.$.location': location?.trim() || '',
      'projects.$.description': description?.trim() || '',
      'projects.$.role': role.trim()
    };

    const updated = await Candidate.findOneAndUpdate(
      { user: userId, 'projects._id': id },
      { $set: setOps },
      { new: true, select: 'projects' }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Not found.' });

    res.json({ success: true, message: 'Project updated.', projects: updated.projects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Delete project
router.post('/delete-project', async (req, res) => {
  try {
    const { userId, id } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId required.' });
    if (!id || !mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: 'Valid project id required.' });

    const updated = await Candidate.findOneAndUpdate(
      { user: userId },
      { $pull: { projects: { _id: id } } },
      { new: true, select: 'projects' }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Candidate not found.' });

    res.json({ success: true, message: 'Project deleted.', projects: updated.projects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});


// ——— Social Profiles ———

// Create social profile
router.post('/create-social', async (req, res) => {
  try {
    const { userId, tempItem } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId required.' });

    const { name, url, description } = tempItem || {};
    const errors = [];
    if (!name?.trim()) errors.push('name is required.');
    if (!url?.trim() || !isValidURL(url))
      errors.push('Valid url is required.');

    if (errors.length)
      return res.status(400).json({ success: false, message: errors.join(' ') });

    const newSocial = {
      name: name.trim(),
      url: url.trim(),
      description: description?.trim() || ''
    };

    const updated = await Candidate.findOneAndUpdate(
      { user: userId },
      { $push: { socialProfiles: newSocial } },
      { new: true, select: 'socialProfiles' }
    );
    if (!updated) {
      const candidateID = await getNextCandidateID()

      const insertCandidate = new Candidate({
        candidateID: candidateID,
        user: new mongoose.Types.ObjectId(userId),
        emailAddress: req.session.user.email,
        socialProfiles: [newSocial]
      })

      const saveCandidate = await insertCandidate.save()

      if (!saveCandidate) {
        return res
          .status(404)
          .json({ success: false, message: 'Failed to save Candidate!' });
      }

    }

    res.json({ success: true, message: 'Profile added.', socialProfiles: updated.socialProfiles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Update social profile
router.post('/update-social', async (req, res) => {
  try {
    const { userId, tempItem } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId required.' });
    if (!tempItem?.id || !mongoose.isValidObjectId(tempItem.id))
      return res.status(400).json({ success: false, message: 'Valid social id required.' });

    const { id, name, url, description } = tempItem;
    const errors = [];
    if (!name?.trim()) errors.push('name is required.');
    if (!url?.trim() || !isValidURL(url))
      errors.push('Valid url is required.');

    if (errors.length)
      return res.status(400).json({ success: false, message: errors.join(' ') });

    const setOps = {
      'socialProfiles.$.name': name.trim(),
      'socialProfiles.$.url': url.trim(),
      'socialProfiles.$.description': description?.trim() || ''
    };

    const updated = await Candidate.findOneAndUpdate(
      { user: userId, 'socialProfiles._id': id },
      { $set: setOps },
      { new: true, select: 'socialProfiles' }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Not found.' });

    res.json({ success: true, message: 'Profile updated.', socialProfiles: updated.socialProfiles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Delete social profile
router.post('/delete-social', async (req, res) => {
  try {
    const { userId, id } = req.body;
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ success: false, message: 'Valid userId required.' });
    if (!id || !mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: 'Valid social id required.' });

    const updated = await Candidate.findOneAndUpdate(
      { user: userId },
      { $pull: { socialProfiles: { _id: id } } },
      { new: true, select: 'socialProfiles' }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Candidate not found.' });

    res.json({ success: true, message: 'Profile deleted.', socialProfiles: updated.socialProfiles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});



module.exports = router;