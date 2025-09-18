// routes/ResumeRouter.js
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const Candidate = require('../models/Candidate');
const userModel = require('../models/User')
const extractTextFromResume = require('../utils/AdvanceFilter/ExtractTextFromResume')
const extractGmailsFromResume = require('../utils/ExtractGmailsFromResume')
const buildResumeHTML = require('../utils/BuildResumeHTML')
const puppeteer = require("puppeteer");

const router = express.Router();

const IDS_DIR = path.join(__dirname, '..', 'uploads', 'resumeids');
const RES_DIR = path.join(__dirname, '..', 'uploads', 'resumes');

// Must be 32 bytes for aes-256
const ENCRYPTION_KEY = Buffer.from(
  'cf5e13f7a01c46caa1d59eb4196b6a64a86c3f46f4f98c8498a073e6b5974f5d',
  'hex'
);
const IV_LENGTH = 16; // For AES, this is always 16

// helper: generate a 25-char URL-safe token
function generateToken() {
  const buf = crypto.randomBytes(18).toString('base64url');
  const extra = crypto.randomBytes(1).toString('hex');
  return (buf + extra).slice(0, 25);
}

// GET /progress
// Streams progress events while processing all files in /uploads/resumeids
router.get('/progress', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const files = await fs.readdir(IDS_DIR);
    const candidates = files.filter(f => ['.pdf', '.docx', '.doc'].includes(path.extname(f).toLowerCase()));
    const total = candidates.length;

    for (let i = 0; i < total; i++) {
      const file = candidates[i];
      const ext = path.extname(file).toLowerCase();
      const base = path.basename(file, ext);
      let message;

      const applicantID = Number(base);
      if (Number.isNaN(applicantID)) {
        message = `Skipped ${file}: invalid applicant ID`;
      } else {
        const candidate = await Candidate.findOne({ applicantID });
        if (!candidate) {
          message = `Skipped ${file}: no matching candidate`;
        } else {
          const token = generateToken();
          const newName = token + ext;
          const src = path.join(IDS_DIR, file);
          const dest = path.join(RES_DIR, newName);

          // move file
          await fs.rename(src, dest);

          // delete old resume if exists
          if (candidate.resumeLink) {
            const old = path.join(__dirname, '..', candidate.resumeLink);
            fs.unlink(old).catch(() => { });
          }

          // update DB
          candidate.resumeAvailable = true;
          candidate.resumeLink = path.join('uploads', 'resumes', newName);
          await candidate.save();

          message = `Processed resume for Applicant ID - ${applicantID}`;
        }
      }

      const percent = Math.round(((i + 1) / total) * 100);
      res.write(`data: ${JSON.stringify({ progress: percent, message })}\n\n`);
      // slight delay for demonstration (remove in production)
      // await new Promise(r => setTimeout(r, 100));
    }

    // finish
    res.write(`data: ${JSON.stringify({ progress: 100, message: 'All done' })}\n\n`);
    res.end();

  } catch (err) {
    res.write(`data: ${JSON.stringify({ progress: 0, message: 'Error: ' + err.message })}\n\n`);
    res.end();
  }
});

router.get("/reSTume/:applicantID", async (req, res, next) => {
  try {
    const { applicantID } = req.params;
    const download = req.query.download === "1";

    const candidate = await Candidate.findOne({ applicantID: +applicantID }).lean();
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });

    // Common PDF headers
    res.contentType("application/pdf");
    // inline vs attachment
    res.setHeader(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="${applicantID}_resume.pdf"`
    );

    // Try existing file
    if (candidate.resumeAvailable && candidate.resumeLink) {
      // normalize backslashes
      const link = candidate.resumeLink.replace(/\\/g, path.sep);
      const filePath = path.isAbsolute(link) ? link : path.join(RES_DIR, link);
      try {
        await fs.access(filePath);
        const fileBuffer = await fs.readFile(filePath);
        res.setHeader("Content-Length", fileBuffer.length);
        return res.send(fileBuffer);
      } catch {
        // fall through to generate
      }
    }

    // Generate via Puppeteer
    // const html = buildResumeHTML(candidate);
    const html = `<html><body><h1 style="color:blue">TEST PDF</h1><p>If you see this, Puppeteer works.</p></body></html>`;
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm" },
    });
    await browser.close();
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});


const handleCount = async (download, userId, candidateId) => {
  try {
    const field = download ? "resumeDownloadHistory" : "resumeViewHistory";
    const counterField = download ? "resumeDownloadCount" : "resumeViewCount"
    await userModel.updateOne({ _id: userId }, {
      $push: { [field]: { candidateId: candidateId, viewedAt: new Date() } },
      $inc: { [counterField]: 1 }

    });
    await Candidate.updateOne({ _id: candidateId }, { $push: { [field]: { userId: userId, viewedAt: new Date() } }, $inc: { [counterField]: 1 } });
    return true
  }
  catch (err) {
    console.log("Error in updating Count:", err)
    return false
  }
}

router.get('/resume/:applicantID', async (req, res, next) => {
  const { applicantID } = req.params;
  const download = req.query.download === '1';
  const userRole = req?.session.user.role
  const userId = req.session.user._id
  try {
    // 1) Find the candidate
    let candidate

    if (!applicantID || !userRole || !userId || !['superadmin', 'admin', 'employer', 'job-seeker'].includes(userRole)){
      return res.status(404).json({ error: 'Candidate or User ID is not found' });
    }

    if ((/^-?\d+$/.test(applicantID.toString())) || typeof applicantID === 'number') {
      candidate = await Candidate.findOne({ applicantID: Number(applicantID) }).lean();
    }
    else {
      candidate = await Candidate.findOne({ _id: applicantID })
    }

    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const { applicantName = "Candidate", experience = {} } = candidate


    const safeName = applicantName.replace(/[<>:"/\\|?*.]/g, '');
    const expLabel = (experience.year || experience.month)
      ? `[${experience.year || 0}y ${experience.month || 0}m]`
      : "_Resume";
    const filename = `SAN_${safeName}${expLabel}`;
    
    // 2) If they already have a resumeLink, stream that file
    let updateCount;
    if (candidate.resumeLink) {
      // assuming resumeLink === "uploads/resumes/v6sp45e8_...pdf"
      const filePath = path.join(__dirname, '..', candidate.resumeLink.replace(/\\/g, '/'));
      const ext = path.extname(filePath).toLowerCase()
      try {
        // Check file exists
        await fs.access(filePath);
        if(userRole === 'employer'){
          updateCount = await handleCount(download, userId, candidate._id)
        }

        // Stream via res.download()
        return res.download(
          filePath,
          `${filename}${ext}`,
          {
            headers: {
              'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}${ext}"`
            }
          },
          err => { if (err) next(err); }
        );
      }
      catch (e) {
        if (e.code !== 'ENOENT') {
          // some other fs error
          return next(e);
        }
        // ENOENT: file missing → fall through to generate PDF
      }

    }
     let html ;

    // 3) Otherwise, generate a fresh PDF via Puppeteer
    html = buildResumeHTML(candidate);
   
    
    // const html = `<html>
    //   <body>
    //     <h1 style="color:blue">TEST PDF</h1>
    //     <p>If you see this, Puppeteer works.</p>
    //   </body>
    // </html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // 2) inject the Tailwind stylesheet from the CDN
    // await page.addStyleTag({
    //   url: 'https://cdn.jsdelivr.net/npm/tailwindcss@^3/dist/tailwind.min.css'
    // });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    });
    await browser.close();

    
    // 4) Stream the generated buffer
    if (userRole === 'employer'){   
        updateCount = await handleCount(download, userId, candidate._id)    
    }

    if(!updateCount){
      return res.json({success : false , error : "Falied to update count"})
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${filename}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);

  } catch (err) {
    // If the existing file was missing, fall back to generating;
    // otherwise, propagate the error.
    if (err.code === 'ENOENT' && !res.headersSent) {
      // remove resumeLink and retry generation once...
      // (or you can just next(err) to show 404)
      return next();
    }
    next(err);
  }
});

function encryptFilename(filename) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(filename, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // store iv with the ciphertext so we can decrypt later
  return iv.toString('hex') + ':' + encrypted;
}

function decryptFilename(encryptedString) {
  const [ivHex, data] = encryptedString.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// --- ROUTE ---
router.get('/process-resumest', async (req, res, next) => {
  try {
    const files = await fs.readdir(IDS_DIR);
    const resumeFiles = files.filter(f =>
      ['.pdf', '.docx'].includes(path.extname(f).toLowerCase())
    );

    let iteration = 0


    for (const file of resumeFiles) {
      iteration += 1


      const fullPath = path.join(IDS_DIR, file);

      // 1) extract text
      const text = await extractTextFromResume(path.relative(process.cwd(), fullPath));
      if (!text) {
        console.log("No text available in file: ", iteration)
        continue;
      }

      // 2) extract gmail addresses
      // const emails = extractGmailsFromResume(text);
      // if (!emails.length && Array.isArray(emails)) {
      //   console.log("No mails found for file: ", iteration)
      //   continue;
      // }

      const emails = await fetch(`http://127.0.0.1:8000/data/`, {
        method: 'post',
        headers: {
          "Content-type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ resumeText: text })
      })

      console.log("EMail found:",iteration, emails)


      // let mailMatchStatus = []
      // for (const email of emails) {
      //   const candidates = await Candidate.find({ emailAddress: email.toLowerCase().trim() })
      //   if (!candidates) {
      //     mailMatchStatus.push({ mail: email, status: false })
      //   }
      //   else {
      //     mailMatchStatus.push({ mail: email, status: true })
      //   }
      // }

      // let encryptedName
      // let resumeLink
      // let mail

      // // 5) move & rename
      // const encryptResumeFile = async () => {
      //   encryptedName = encryptFilename(file) + path.extname(file);
      //   const destPath = path.join(RES_DIR, encryptedName);
      //   await fs.rename(fullPath, destPath);
      // }

      // if (mailMatchStatus.length === 1 && mailMatchStatus[0].status === true) {
      //   mail = mailMatchStatus[0].mail
      //   encryptResumeFile()
      // }

      // if (mailMatchStatus.length > 1 && mailMatchStatus.every(mailStatus => mailStatus.status === true)) {
      //   console.log("Skiping, all found mails have an associated record in Database")
      //   continue
      // }
      // else if (mailMatchStatus.length > 1 && mailMatchStatus.some(mailStatus => mailStatus.status === true)) {
      //   const matches = mailMatchStatus.filter(mailStatus => mailStatus.status === true)
      //   if (matches.length === 1) {
      //     mail = matches[0].mail
      //     encryptResumeFile()
      //   }
      //   else {
      //     console.log("Skiping, found two or more mails have an associated record in Database")
      //     continue
      //   }
      // }
      // else if (mailMatchStatus.length === 0) {
      //   console.log("Skipping, No associated mails found!")
      //   continue
      // }
      // else {
      //   console.log("Skipping iteration..")
      // }

      // if (!encryptedName) {
      //   console.log("Skipping, Failed to generate encrypted file name")
      //   continue
      // }

      // resumeLink = path.join('uploads', 'resumes', encryptedName);

      // if (!resumeLink) {
      //   console.log("Skipping, Failed to generate Resume link")
      //   continue
      // }

      // if (!mail) {
      //   console.log("Skipping, No mails are associated.")
      //   continue
      // }

      // // 6) update DB
      // const updateCandidate = await Candidate.updateOne({ emailAddress: mail }, { $set: { resumeLink: resumeLink, resumeAvailable: true } })

      // if (!updateCandidate) {
      //   console.log("Skipping, Failed to update Candidate with resume link")
      //   continue
      // }

    }

    return res.status(200).json({ success: true, message: "Succesfully processed all resumes!" });
  } catch (err) {
    console.log("Error in processing Resumes:", err);
    return res.status(404).json({ success: false, message: "Failed in processing resumes!" });
  }
});

router.get('/process-resumes', async (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    const files = await fs.readdir(IDS_DIR);
    const resumeFiles = files.filter(f =>
      ['.pdf', '.docx'].includes(path.extname(f).toLowerCase())
    );
    send({ progress: 0, message: `Found ${resumeFiles.length} file(s).` });

    for (let i = 0; i < resumeFiles.length; i++) {
      const file = resumeFiles[i];
      const percentBase = Math.floor((i) / resumeFiles.length * 100);
      send({
        progress: percentBase,
        message: `[${i + 1}/${resumeFiles.length}] Processing “${file}”…`
      });

      const fullPath = path.join(IDS_DIR, file)
      let text
      try {
        text = await extractTextFromResume(path.relative(process.cwd(), fullPath))
      }
      catch (parseErr) {
        console.log(`Error parsing ${file}:`, parseErr);
        send({
          progress: null,
          message: `⚠ Parse error in ${file}: ${parseErr.message}`
        })
        continue
      }

      if (!text) {
        send({ progress: null, message: `✖ No text; skipping ${file}.` });
        continue;
      }
      send({ progress: null, message: `✔ Text extracted.` });

      // const emails = extractGmailsFromResume(text);


      const fetchEmails = await fetch(`http://127.0.0.1:8000/data/`, {
        method: 'post',
        headers: {
          "Content-type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ resumeText: text })
      })

      if(!fetchEmails){
        send({ progress: null, message: `✖ Failed to fetch 8000/data API; skipping ${file}.` });
        continue;
      }

      const res = await fetchEmails.json()

      if (!res.received_data) {
        send({ progress: null, message: `✖ Failed to handle 8000/data API response; skipping ${file}.` });
        continue;
      }

      const emails = res.received_data

      console.log("EMail found:", i, emails)

      if (!emails.length) {
        send({ progress: null, message: `✖ No Gmail found; skipping ${file}.` });
        continue;
      }
      send({ progress: null, message: `✔ Found: ${emails.join(', ')}.` });

      // Check DB
      const statuses = await Promise.all(
        emails.map(async email => ({
          mail: email,
          status: Boolean(await Candidate.exists({ emailAddress: email.toLowerCase().trim() }))
        }))
      );
      const matches = statuses.filter(s => s.status);
      if (matches.length !== 1) {
        send({ progress: null, message: `✖ ${matches.length} DB matches; skipping.` });
        continue;
      }

      const chosenMail = matches[0].mail;
      // Sanitize the encrypted name
      let nameHash = encryptFilename(file).replace(/[:\/\\]/g, '');
      const encryptedName = nameHash + path.extname(file);

      // Try moving the file
      try {
        await fs.rename(fullPath, path.join(RES_DIR, encryptedName));
      } catch (mvErr) {
        console.log(`Error moving ${file}:`, mvErr);
        send({ progress: null, message: `⚠ Move failed: ${mvErr.message}` });
        continue;
      }

      // Update DB
      const resumeLink = path.join('uploads', 'resumes', encryptedName);
      const update = await Candidate.updateOne(
        { emailAddress: chosenMail.toLowerCase().trim() },
        { $set: { resumeLink, resumeAvailable: true } }
      );
      if (update.matchedCount === 0) {
        send({ progress: null, message: `✖ DB update failed for ${chosenMail}.` })
        continue;
      }

      send({
        progress: Math.floor((i + 1) / resumeFiles.length * 100),
        message: `✔ ${file} → ${encryptedName} (linked to ${chosenMail}).`
      })
    }

    send({ progress: 100, message: 'All resumes processed.' })
    res.end();
  } catch (err) {
    console.log("Error in processing Resume:", err)
    send({ progress: null, message: `⚠ Error: ${err.message}` })
    res.end();
  }
});

router.delete('/resume-links', async (req, res, next) => {
  try {
    const result = await Candidate.updateMany(
      { resumeLink: { $exists: true } },
      { $unset: { resumeLink: "" } }
    );

    return res.json({
      message: 'All resumeLink fields removed',
      modifiedCount: result.nModified ?? result.modifiedCount
    });
  } catch (err) {
    next(err);
  }
});

router.get('/st', async (req, res) => {
  try {

    const sampleCandidate = {
      applicantID: 12345,
      firstName: "John",
      middleName: "K.",
      lastName: "Doe",
      applicantName: "John K. Doe",
      applicantFullName: "John Kevin Doe",
      emailAddress: "john.doe@example.com",
      password: "hashed_password_here",
      alternateEmailAddress: "j.doe@altmail.com",
      phoneNumber: {
        countryCode: 91,
        number: 9876543210,
      },
      alternatePhoneNumber: {
        countryCode: 1,
        number: 5551234567,
      },
      gender: "male",
      dateOfBirth: new Date("1990-05-15"),
      disability: {
        isDisabled: false,
        desc: "",
      },
      maritalStatus: "single",
      languages: [
        { name: "English", proficiency: "advanced", read: true, write: true, speak: true },
        { name: "Hindi", proficiency: "intermediate", read: true, write: false, speak: true },
      ],
      presentAddress: {
        addressLine1: "123 Main Street",
        addressLine2: "Apt 4B",
        city: "Mumbai",
        district: "South Mumbai",
        state: "Maharashtra",
        country: "India",
        zipCode: 400001,
      },
      permanentAddress: {
        addressLine1: "456 Elm Road",
        addressLine2: "",
        city: "Pune",
        district: "Pune District",
        state: "Maharashtra",
        country: "India",
        zipCode: 411001,
      },
      workStatus: true,
      preferredJob: ["frontend developer", "fullstack developer"],
      preferredLocation: ["Mumbai", "Pune"],
      relocation: false,
      experience: { year: 3, month: 6 },
      currentCTC: { currency: "inr", amount: 800000 },
      expectedCTC: { currency: "inr", amount: 1200000 },
      noticePeriod: "30 days",
      noticePeriodServingDate: new Date("2025-07-01"),
      negotiableNoticePeriod: "15 days",
      lwd: new Date("2025-06-30"),    // last working day
      profileSummary: "Full‑stack developer with 3.5 years of experience in MERN stack.",
      primarySkills: [
        {
          primarySkill: "react",
          experience: { year: 2, month: 0 },
          lastUsed: 2025,
          version: 18,
        }
      ],
      skills: [
        {
          skill: "nodejs",
          experience: { year: 3, month: 6 },
          lastUsed: 2025,
          version: 16,
        },
        {
          skill: "mongodb",
          experience: { year: 2, month: 6 },
          lastUsed: 2025,
          version: 5,
        }
      ],
      resumeAvailable: true,
      resumeLink: "uploads/resumes/ivHex:cipheredName.pdf",
      educations: [
        {
          institutionName: "ABC University",
          courseCategory: "Engineering",
          courseType: "Bachelor of Technology",
          courseName: "Computer Science",
          startDate: new Date("2015-08-01"),
          endDate: new Date("2019-05-15"),
          courseCompletion: { year: 2019, month: 5 },
          isOngoing: false,
          gpa: 3.8,
          city: "Mumbai",
          state: "Maharashtra",
          country: "India",
        }
      ],
      experiences: [
        {
          jobTitle: "Software Engineer",
          employer: "Tech Solutions Pvt. Ltd.",
          periodFrom: new Date("2019-06-01"),
          periodTo: new Date("2023-12-31"),
          isOngoing: false,
          location: "Mumbai",
          description: "Worked on developing and maintaining web applications using React and Node.js.",
          isCurrentExperience: false,
        }
      ],
      projects: [
        {
          projectName: "E‑commerce Platform",
          clientName: "RetailCorp",
          periodFrom: new Date("2022-01-01"),
          periodTo: new Date("2022-06-30"),
          location: "Remote",
          description: "Built a full‑stack e‑commerce platform with React, Express, and MongoDB.",
          role: "Lead Developer",
        }
      ],
      certifications: [
        {
          certificationName: "MongoDB Certified Developer",
          organization: "MongoDB University",
          periodFrom: new Date("2021-03-01"),
          periodTo: new Date("2021-03-01"),
          location: "Online",
          description: "Certified in MongoDB fundamentals and data modeling.",
          link: "https://university.mongodb.com/certificate/abc123",
        }
      ],
      socialProfiles: [
        { name: "GitHub", url: "https://github.com/johndoe", description: "GitHub profile" },
        { name: "LinkedIn", url: "https://linkedin.com/in/johndoe", description: "LinkedIn profile" },
      ],
      createdBy: "admin_user",
      createdOn: new Date(),
      createdDate: new Date(),
      updatedOn: new Date(),
      updatedBy: "admin_user",
      actualSource: "manual",
      source: "web",
      applicantStatus: "new",
      ownership: "internal",
      recentNoteOn: new Date(),
      profileSourced: "referral",
      sanSpoc: "Spoc Name",
      hiringMode: "ft"
    };

    const html = buildResumeHTML(sampleCandidate)

    return res.send(html)
  }
  catch (err) {
    console.log("Error in renderinng:", err)
    return res.send({ success: false, message: 'Failed' })
  }
})


const multer = require("multer");

// Multer setup (for bulk uploads)
const storage = multer.memoryStorage(); // keep in memory for parsing immediately
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".pdf", ".docx", ".doc"].includes(ext)) {
      return cb(new Error("Only .pdf, .docx, .doc files are allowed"));
    }
    cb(null, true);
  },
});

router.post("/bulk-parse-resumes", upload.array("resumes", 100), async (req, res) => {
  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    const files = req.files || [];
    if (!files.length) {
      send({ progress: null, message: "✖ No valid resume files uploaded." });
      return res.end();
    }

    send({ progress: 0, message: `Found ${files.length} file(s).` });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const percentBase = Math.floor((i / files.length) * 100);

      send({
        progress: percentBase,
        message: `[${i + 1}/${files.length}] Processing “${file.originalname}”…`,
      });

      let text;
      try {
        // Ensure temp dir exists
        const tempDir = path.join(__dirname, "..", "uploads", "temp");
        await fs.mkdir(tempDir, { recursive: true });

        // Save to temp file
        const tempPath = path.join(tempDir, file.originalname);
        await fs.writeFile(tempPath, file.buffer);

        text = await extractTextFromResume(path.relative(process.cwd(), tempPath));
        console.log("text::",text)
        // cleanup temp file
        await fs.unlink(tempPath);
      } catch (err) {
        console.error(`Error parsing ${file.originalname}:`, err);
        send({ progress: null, message: `⚠ Parse error in ${file.originalname}: ${err.message}` });
        continue;
      }

      if (!text) {
        send({ progress: null, message: `✖ No text extracted; skipping ${file.originalname}.` });
        continue;
      }
      send({ progress: null, message: `✔ Text extracted from ${file.originalname}.` });

      // Call ML API
      try {
        const fetchData = await fetch("http://127.0.0.1:8000/data/", {
          method: "post",
          headers: {
            "Content-type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ resumeText: text }),
        });

        if (!fetchData) {
          send({
            progress: null,
            message: `✖ Failed to reach ML API for ${file.originalname}`,
          });
          continue;
        }

        const mlRes = await fetchData.json();
        if (!mlRes.received_data) {
          send({
            progress: null,
            message: `✖ Invalid response from ML API for ${file.originalname}`,
          });
          continue;
        }

        const resumeData = mlRes.received_data;

        console.log("Resume Data:", i, resumeData);
        send({
          progress: null,
          message: `✔ Metadata extracted for ${file.originalname}: ${JSON.stringify(resumeData)}`,
        });
      } catch (err) {
        console.error("ML API error:", err);
        send({ progress: null, message: `⚠ ML API error for ${file.originalname}: ${err.message}` });
        continue;
      }
    }

    send({ progress: 100, message: "✔ All resumes processed." });
    res.end();
  } catch (err) {
    console.error("Error in bulk-parse-resumes:", err);
    send({ progress: null, message: `⚠ Error: ${err.message}` });
    res.end();
  }
});

module.exports = router;
