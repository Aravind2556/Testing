// utils/candidateUtils.js
// Utility functions to parse Excel rows into Candidate docs

const parsePhone = (raw) => {
  // expects a string like "+1-234-567-8901" or "1234567890"
  const digits = raw.toString().replace(/[^0-9]/g, '');
  // naive: last 10 digits as number, rest as country code
  const number = digits.slice(-10);
  const countryCode = digits.slice(0, -10) || '';
  return { countryCode, mobileNumber: number };
};

const parseMulti = (raw) => {
  if (!raw) return [];
  return raw.toString().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
};

const parseExperience = (raw) => {
  // e.g. "2 yrs 3 mos" or "2.5"
  if (!raw) return {};
  const m = raw.toString().match(/(\d+)\s*(?:yr|y)/i);
  const months = raw.toString().match(/(\d+)\s*(?:mo)/i);
  return {
    year: m ? parseInt(m[1], 10) : 0,
    month: months ? parseInt(months[1], 10) : 0
  };
};

const parseCTC = (raw) => {
  if (!raw) return {};
  const str = raw.toString().replace(/[^0-9\.]/g, '');
  const amount = Number(str) || 0;
  return amount > 0 ? { amount } : {};
};

const parseGender = (raw) => {
  if (!raw) return null;
  const v = raw.toString().toLowerCase();
  if (['m', 'male', 'man'].includes(v)) return 'Male';
  if (['f', 'female', 'woman'].includes(v)) return 'Female';
  return null;
};

const parseBool = (raw) => {
  if (raw == null) return null;
  const v = raw.toString().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(v)) return true;
  if (['no', 'n', 'false', '0'].includes(v)) return false;
  return null;
};

const parseDate = (raw) => {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

const parseNotice = (raw) => {
  if (!raw) return null;
  // e.g. "2 weeks", "30 days"
  const m = raw.toString().match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

const generatePassword = async () => {
  // simple random 8-char alphanumeric
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let pass = '';
  for (let i = 0; i < 8; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
};

// buildDocFromRow: maps an object of columnName -> cellValue to the Candidate doc
const buildDocFromRow = (row) => {
  const doc = {};
  if (row['Applicant ID']) doc.applicantID = Number(row['Applicant ID']);
  if (row['Applicant Name']) doc.applicantName = row['Applicant Name'].trim();
  if (row['Email Address']) doc.emailAddress = row['Email Address'].trim().toLowerCase();
  doc.password = undefined; // set later in router using generatePassword
  if (row['Mobile Number']) doc.phoneNumber = parsePhone(row['Mobile Number']);
  if (row['Job Title']) doc.preferredJob = parseMulti(row['Job Title']);

  // presentAddress
  doc.presentAddress = {};
  if (row['City']) doc.presentAddress.city = row['City'];
  if (row['State']) doc.presentAddress.state = row['State'];
  if (row['Country']) doc.presentAddress.country = row['Country'];
  if (row['Address']) doc.presentAddress.addressLine1 = row['Address'];
  const zip = parseInt(row['Zip Code'], 10);
  if (!isNaN(zip)) doc.presentAddress.zipCode = zip;

  if (row['Source']) doc.source = row['Source'];
  if (row['Applicant Status']) doc.applicantStatus = row['Applicant Status'];
  doc.experience = parseExperience(row['Experience']);

  const expCTC = parseCTC(row['Expected Pay']);
  if (expCTC.amount) doc.expectedCTC = expCTC;

  const g = parseGender(row['Gender']);
  if (g) doc.gender = g;

  if (row['Disability']) {
    const d = parseBool(row['Disability']);
    if (d != null) doc.disability = { isDisabled: d };
  }

  if (row['Created By']) doc.createdBy = row['Created By'];
  if (row['Created On']) {
    const d = parseDate(row['Created On']);
    if (d) doc.createdOn = d;
  }
  if (row['Last Name']) doc.lastName = row['Last Name'];
  if (row['Ownership']) doc.ownership = row['Ownership'];
  if (row['Updated On']) {
    const d = parseDate(row['Updated On']);
    if (d) doc.updatedOn = d;
  }

  if (row['Skills']) {
    const skills = parseMulti(row['Skills']);
    if (skills.length) {
      doc.skills = skills.map(skill => ({ skill, experience: doc.experience }));
    }
  }

  const curCTC = parseCTC(row['Current CTC']);
  if (curCTC.amount) doc.currentCTC = curCTC;

  // experiences array
  const exp = {};
  if (row['Current Employer'] && row['Current Employer'].toString().trim().toLowerCase() !== 'undefined') {
    exp.employer = row['Current Employer'];
  }
  if (row['Job Title']) exp.jobTitle = row['Job Title'];
  if (Object.keys(exp).length) {
    exp.isOngoing = true;
    doc.experiences = [exp];
  }

  if (row['Home Phone Number']) doc.alternatePhoneNumber = parsePhone(row['Home Phone Number']);
  if (row['Alternate Email Address']) doc.alternateEmailAddress = row['Alternate Email Address'];
  if (row['Applicant Full Name']) doc.applicantFullName = row['Applicant Full Name'];

  if (row['Date Of Birth']) {
    const d = parseDate(row['Date Of Birth']);
    if (d) doc.dateOfBirth = d;
  }
  if (row['First Name']) doc.firstName = row['First Name'];
  if (row['Preferred Location']) doc.preferredLocation = parseMulti(row['Preferred Location']);
  if (row['Primary Skills']) {
    const ps = parseMulti(row['Primary Skills']);
    if (ps.length) {
      doc.primarySkills = ps.map(skill => ({ primarySkill: skill, experience: doc.experience }));
    }
  }

  if (row['Recent Note On']) {
    const d = parseDate(row['Recent Note On']); if (d) doc.recentNoteOn = d;
  }
  if (row['Relocation']) {
    const r = parseBool(row['Relocation']); if (r != null) doc.relocation = r;
  }
  if (row['Notice Period']) doc.noticePeriod = parseNotice(row['Notice Period']);
  if (row['Resume Available']) {
    const ra = parseBool(row['Resume Available']); if (ra != null) doc.resumeAvailable = ra;
  }
  if (row['Created date']) {
    const d = parseDate(row['Created date']); if (d) doc.createdDate = d;
  }
  if (row['Notice Period Serving Date']) {
    const d = parseDate(row['Notice Period Serving Date']); if (d) doc.noticePeriodServingDate = d;
  }
  if (row['Updated By']) doc.updatedBy = row['Updated By'];
  if (row['Profile Sourced']) doc.profileSourced = row['Profile Sourced'];
  if (row['Negotiable Notice Period']) doc.negotiableNoticePeriod = parseNotice(row['Negotiable Notice Period']);

  // remove empty objects/fields (will also preserve dates)
  Object.keys(doc).forEach(k => {
    const v = doc[k];
    if (v == null
      || (typeof v === 'string' && !v.trim())
      || (Array.isArray(v) && !v.length)
      || (typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !Object.keys(v).length)
    ) delete doc[k];
  });

  return doc;
};

module.exports = {
  parsePhone,
  parseMulti,
  parseExperience,
  parseCTC,
  parseGender,
  parseBool,
  parseDate,
  parseNotice,
  generatePassword,
  buildDocFromRow
};
