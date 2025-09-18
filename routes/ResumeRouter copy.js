// routes/ResumeRouter.js
const Express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CandidateModel = require('../models/Candidate');
const ResumeRefModel = require('../models/ResumeRef');

const ResumeRouter = Express.Router();

ResumeRouter.get('/process-resume', async (req, res) => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Dynamic CORS…
  const origin = req.headers.origin;
  const allowed = ['http://localhost:3000', 'http://192.168.0.47:3000'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.flushHeaders();
  res.write(`retry: 10000\n\n`);
  res.write(`data: ▶️ Stream opened, loading candidates…\n\n`);

  const sourceDir = path.resolve(__dirname, '..', 'uploads', 'resumeids');
  const targetDir = path.resolve(__dirname, '..', 'uploads', 'resumes');

  const existingExts = ['.pdf', '.docx', '.doc'];

  // load all valid IDs
  const existingIDs = await CandidateModel.find({})
    .distinct('applicantID')
    .catch(() => []);
  res.write(`data: ℹ️ Loaded ${existingIDs.length} candidates from DB\n\n`);

  let resumeRef = await ResumeRefModel.findOne().catch(() => null);
  if (!resumeRef) {
    resumeRef = new ResumeRefModel({
      pushedResumes: [],
      failedResumes: [],
      existingResumes: []
    });
  }

  let files;
  try {
    files = await fs.promises.readdir(sourceDir);
  } catch (err) {
    res.write(`data: 💥 Could not read sourceDir: ${err.message}\n\n`);
    return res.end();
  }

  res.write(`data: ℹ️ Found ${files.length} files in resumeids/\n\n`);

  for (const file of files) {
    const idPart = path.parse(file).name;
    const ext = path.extname(file).toLowerCase();
    const applicantID = parseInt(idPart, 10);

    // check extension
    if (!existingExts.includes(ext)) {
      res.write(`data: ⚠️ Skipping unsupported file type: ${file}\n\n`);
      resumeRef.failedResumes.push(applicantID);
      continue;
    }

    // check DB record
    if (!existingIDs.includes(applicantID)) {
      res.write(`data: ⚠️ No candidate for ID ${applicantID}, skipping ${file}\n\n`);
      resumeRef.failedResumes.push(applicantID);
      continue;
    }

    // begin processing
    res.write(`data: 🔄 Processing applicant ${applicantID}…\n\n`);
    try {
      const candidate = await CandidateModel.findOne({ applicantID });

      // if they already have a resumeLink and file exists, skip
      if (candidate.resumeLink) {
        const diskPath = path.resolve(
          __dirname,
          '..',
          candidate.resumeLink.replace(/^\//, '')
        );
        try {
          await fs.promises.access(diskPath);
          res.write(`data: ⚠️ Resume exists for ${applicantID}, skipping\n\n`);
          resumeRef.existingResumes.push(applicantID);
          continue;
        } catch {
          // file missing: fall through to reprocess
        }
      }

      // move & link
      const encryptedName = crypto.randomBytes(12).toString('hex') + ext;
      await fs.promises.rename(
        path.join(sourceDir, file),
        path.join(targetDir, encryptedName)
      );

      candidate.resumeLink = `/uploads/resumes/${encryptedName}`;
      candidate.resumeAvailable = true;
      await candidate.save();

      resumeRef.pushedResumes.push(applicantID);
      res.write(`data: ✅ Linked resume for ${applicantID}\n\n`);
    } catch (err) {
      resumeRef.failedResumes.push(applicantID);
      res.write(`data: ❌ Failed ${applicantID}: ${err.message}\n\n`);
    }
  }

  await resumeRef.save().catch(() => {});
  res.write(`event: end\ndata: ✔️ All done\n\n`);
  setTimeout(() => res.end(), 200);
});

ResumeRouter.get('/progress', async(req, res)=>{

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const temp = ['s', 't', 'k', 'k']

  for(let i = 0; i < temp.length; i++){

    await new Promise(resolve => setTimeout(resolve, 1000))

    res.write(`data: ${JSON.stringify({
      status: 'progress',
      message: `Processing ${temp[i]}...`
    })}\n\n`)

    if(i === temp.length - 1){
      res.write(`data: ${JSON.stringify({
      status: 'end',
      message: `Completed!`
    })}\n\n`)
      res.end()
    }
  }
``
})

module.exports = ResumeRouter;
