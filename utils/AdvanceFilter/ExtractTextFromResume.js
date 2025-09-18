// extractTextFromResume.js
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');

const extractTextFromResume = async (resumeLink) => {
  const resumePath = path.join(__dirname, "../../", resumeLink);
  if (!fs.existsSync(resumePath)) return null;

  const ext = path.extname(resumePath).toLowerCase();

  if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(resumePath);
    const { text } = await pdfParse(dataBuffer);
    return text;
  }

  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ path: resumePath });
    return value;
  }

  if (ext === '.doc') {
    try {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(resumePath);
      return doc.getBody();
    } catch (err) {
      console.error('DOC extraction failed for', resumePath, '\n', err);
      // you could also write the failure to a logfile or DB for later inspection
      return null;
    }
  }

  // unsupported format
  return null;
};

module.exports = extractTextFromResume;
