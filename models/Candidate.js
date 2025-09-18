const userModel = require('./User')
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define individual weights summing exactly to 100
const fieldWeights = {
  firstName: 1,
  lastName: 1,
  applicantName: 1,
  emailAddress: 5,
  'phoneNumber.number': 5,
  gender: 2,
  dateOfBirth: 2,
  maritalStatus: 2,
  languages: 8,
  'presentAddress.addressLine1': 1,
  'presentAddress.addressLine2': 1,
  'presentAddress.city': 1,
  'presentAddress.district': 1,
  'presentAddress.state': 1,
  'presentAddress.country': 1,
  'presentAddress.zipCode': 1,
  'permanentAddress.addressLine1': 1,
  'permanentAddress.addressLine2': 1,
  'permanentAddress.city': 1,
  'permanentAddress.district': 1,
  'permanentAddress.state': 1,
  'permanentAddress.country': 1,
  'permanentAddress.zipCode': 1,
  workStatus: 2,
  preferredJob: 3,
  preferredLocation: 3,
  relocation: 2,
  'experience.month': 2,
  'experience.year': 2,
  'currentCTC.amount': 3,
  'expectedCTC.amount': 3,
  noticePeriod: 2,
  noticePeriodServingDate: 2,
  negotiableNoticePeriod: 2,
  lwd: 2,
  profileSummary: 5,
  primarySkills: 6,
  skills: 6,
  resumeLink: 4,
  profilePicLink: 2,
  educations: 4,
  experiences: 4,
  projects: 3,
  certifications: 3,
  socialProfiles: 2
};

const candidateSchema = new Schema({
  candidateID: {type: String, required: true, unique: true, lowercase: true, trim: true},
  applicantID: { type: Number, unique: true, sparse: true },
  user: { type: Schema.Types.ObjectId, ref: userModel },
  firstName: { type: String, trim: true },
  middleName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  applicantName: { type: String, trim: true },
  applicantFullName: { type: String, trim: true },
  emailAddress: { type: String, lowercase: true, trim: true, unique: true },
  alternateEmailAddress: { type: String, lowercase: true, trim: true },
  phoneNumber: {
    countryCode: { type: Number, default: 91 },
    number: { type: Number },
  },
  alternatePhoneNumber: {
    countryCode: { type: Number, default: 91 },
    number: { type: Number },
  },
  gender: { type: String, lowercase: true, trim: true, enum: ["female", "male", "other"] },
  dateOfBirth: { type: Date },
  disability: {
    isDisabled: { type: Boolean, default: false },
    desc: { type: String }
  },
  maritalStatus: { type: String, lowercase: true, trim: true, enum: ["single", "married", "divorced", "widowed"] },
  languages: [
    {
      name: { type: String },
      proficiency: { type: String, lowercase: true, trim: true, enum: ["beginner", "intermediate", "advanced"] },
      read: { type: Boolean },
      write: { type: Boolean },
      speak: { type: Boolean }
    }
  ],
  profileSummary: { type: String },
  sameasPresentAddress : {type : Boolean , default : false},
  isSummeryInfromation: { type: Boolean, default: false },
  presentAddress: {
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    district: { type: String },
    state: { type: String },
    country: { type: String },
    zipCode: { type: Number }
  },
  permanentAddress: {
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    district: { type: String },
    state: { type: String },
    country: { type: String },
    zipCode: { type: Number }
  },
  workStatus: { type: Boolean },

// Preferences Deatils
  preferredJob: { type: [String], lowercase: true, trim: true },
  preferredLocation: { type: [String], lowercase: true, trim: true },
  employmentType: { type: [String], lowercase: true, trim: true },
  preferredWorkMode: { type: [String], lowercase: true, trim: true },
  currentCTC: {
    currency: { type: String, lowercase: true, trim: true, default: "inr" },
    amount: { type: Number }
  },
  expectedCTC: {
    currency: { type: String, lowercase: true, trim: true, default: "inr" },
    amount: { type: Number }
  },
  noticePeriod: { type: String, lowercase: true, trim: true, enum: ["immediate joiner", "currently serving notice period", "7 days", "15 days", "30 days", "45 days", "60 days", "90 days"] },
  negotiableNoticePeriod: { type: String, lowercase: true, trim: true, enum: ["immediate joiner", "currently serving notice period", "7 days", "15 days", "30 days", "45 days", "60 days", "90 days"] },
  isPreferredInformation: { type: Boolean, default: false },




  relocation: { type: Boolean },
  experience: {
    month: { type: Number },
    year: { type: Number }
  },
  noticePeriodServingDate: { type: Date },
  lwd: { type: Date },
  primarySkills: [{
    primarySkill: { type: String, lowercase: true, trim: true },
    experience: {
      month: { type: Number },
      year: { type: Number }
    },
    lastUsed: { type: Number, trim: true },
    version: {type: String, trim: true}
  }],
  skills: [{
    skill: { type: String, lowercase: true, trim: true },
    experience: {
      month: { type: Number },
      year: { type: Number }
    },
    lastUsed: { type: Number, trim: true },
    version: {type: String, trim: true}
  }],
  resumeAvailable: { type: Boolean },
  resumeLink: { type: String, lowercase: true, trim: true },
  profilePicLink: { type: String, lowercase: true, trim: true },
  educations: [
    {
      institutionName: { type: String, trim: true },
      courseCategory: { type: String, trim: true },
      courseType: { type: String, trim: true },
      courseName: { type: String, trim: true },
      startDate: { type: Date },
      endDate: { type: Date },
      courseCompletion: {
        month: {type: Number},
        year: {type: Number},
      },
      isOngoing: { type: Boolean },
      gpa: { type: Number },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
    }
  ],
  experiences: [
    {
      jobTitle: { type: String, trim: true },
      employer: { type: String, trim: true },
      periodFrom: { type: Date },
      periodTo: { type: Date },
      isOngoing: { type: Boolean },
      location: { type: String, trim: true },
      description: { type: String, trim: true },
      isCurrentExperience: { type: Boolean },
    }
  ],
  projects: [
    {
      projectName: { type: String, trim: true },
      clientName: { type: String, trim: true },
      periodFrom: { type: Date },
      periodTo: { type: Date },
      location: { type: String, trim: true },
      description: { type: String, trim: true },
      role: { type: String, trim: true },
    }
  ],
  certifications: [
    {
      certificationName: { type: String, trim: true },
      organization: { type: String, trim: true },
      periodFrom: { type: Date },
      periodTo: { type: Date },
      location: { type: String, trim: true },
      description: { type: String, trim: true },
      link: { type: String, trim: true }
    }
  ],
  socialProfiles: [
    {
      name: { type: String, trim: true },
      url: { type: String, trim: true, lowercase: true },
      description: { type: String, trim: true },
    }
  ],
  createdBy: { type: String, trim: true },
  createdOn: { type: Date },
  createdDate: { type: Date },
  updatedOn: { type: Date },
  updatedBy: { type: String, trim: true },
  actualSource: { type: String, trim: true },
  source: { type: String, trim: true },
  applicantStatus: { type: String, trim: true },
  ownership: { type: String, trim: true },
  recentNoteOn: { type: Date },
  profileSourced: { type: String, trim: true },
  sanSpoc: { type: String, trim: true },
  hiringMode: { type: String, lowercase: true, trim: true, enum: ["tp", "ft", "c2c", "c2h", "intern"] },
  score: { type: Number, default: 0 },
  newResumeStatus: { type: Boolean, default: false },
  newResumeUploadOn: { type: Date },
  profileViewCount: { type: Number, default: 0 },
  resumeViewCount: { type: Number, default: 0 },
  resumeDownloadCount: { type: Number, default: 0 },
  profileViewHistory: [
    {
      userId: { type: String, required: true, unique: true },
      viewedAt : {type : [Date]}
    }
  ],
  resumeViewHistory: [
    {
      userId: { type: String, required: true, unique: true },
      viewedAt: { type: [Date]}
    }
  ], //field to store candidate's resume views - User ID as String
  resumeDownloadHistory: [
    {
      userId: { type: String, required: true, unique: true },
      viewedAt: { type: [Date]}
    }
  ] //field to store candidate's resume downloads - User ID as String
},{
  timestamps: true
});

candidateSchema.index({
  "languages.name": "text",
  "presentAddress.city": "text",
  "presentAddress.district": "text",
  "presentAddress.state": "text",
  "preferredJob": "text",
  "preferredLocation": "text",
  "profileSummary": "text",
  "primarySkills.primarySkill": "text",
  "skills.skill": "text",
  "educations.institutionName": "text",
  "educations.courseName": "text",
  "experiences.jobTitle": "text",
  "experiences.employer": "text",
  "experiences.description": "text",
  "projects.projectName": "text",
  "projects.clientName": "text",
  "projects.description": "text",
  "certifications.certificationName": "text",
  "certifications.description": "text"
});

// Helpers
const isPresent = v => v != null && (typeof v !== 'string' || v.trim() !== '');
const isNonEmptyArray = arr => Array.isArray(arr) && arr.length > 0;

// Score calculation
function calculateWeightedScore(doc) {
  let sum = 0;
  for (const [path, weight] of Object.entries(fieldWeights)) {
    const keys = path.split('.');
    let value = doc;
    keys.forEach(k => { if (value != null) value = value[k]; });
    if (['languages','primarySkills','skills','educations','experiences','projects','certifications','socialProfiles','preferredJob','preferredLocation'].includes(path)) {
      sum += weight * (isNonEmptyArray(value) ? 1 : 0);
    } else {
      sum += weight * (isPresent(value) ? 1 : 0);
    }
  }
  return Math.min(sum, 100);
}

// Hooks
candidateSchema.pre('save', function(next) {
  this.score = calculateWeightedScore(this);
  next();
});

candidateSchema.pre('findOneAndUpdate', async function(next) {
  try {
    const update = this.getUpdate() || {};
    const payload = update.$set ? { ...update.$set } : { ...update };
    const doc = await this.model.findOne(this.getQuery()).lean();
    if (!doc) return next();
    const merged = { ...doc, ...payload };
    const newScore = calculateWeightedScore(merged);
    this.setUpdate({
      ...update,
      $set: { ...(update.$set || {}), score: newScore }
    });
    next();
  } catch (err) {
    next(err);
  }
});

candidateSchema.post('init', function(doc) { doc.score = calculateWeightedScore(doc); });
candidateSchema.post('find', function(docs) { docs.forEach(d => d.score = calculateWeightedScore(d)); });
candidateSchema.post('findOne', function(doc) { if (doc) doc.score = calculateWeightedScore(doc); });


const Candidate = mongoose.model('candidate-portal-v1-candidate', candidateSchema);


module.exports = Candidate
