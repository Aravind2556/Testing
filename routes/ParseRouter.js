const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsp = require("fs").promises;
const { v4: uuidv4 } = require("uuid");
const extractTextFromResume = require("../utils/AdvanceFilter/ExtractTextFromResume");

const router = express.Router();

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const ML_API_URL = process.env.ML_API_URL || "http://127.0.0.1:5005/parse";

// Multer in-memory
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (![".pdf", ".docx", ".doc"].includes(ext)) {
            return cb(new Error("Only .pdf, .docx, .doc files are allowed"));
        }
        cb(null, true);
    },
}).array("resumes", 500);

// Helpers
async function ensureDir(dir) {
    try {
        await fsp.mkdir(dir, { recursive: true });
    } catch (e) { }
}

async function removeDir(dir) {
    try {
        await fsp.rm(dir, { recursive: true, force: true });
    } catch (e) { }
}

async function writeFile(filePath, buffer) {
    await ensureDir(path.dirname(filePath));
    await fsp.writeFile(filePath, buffer);
}

// -------- ROUTES --------

// Upload resumes → returns jobId
// router.post("/bulk-parse-resumes", (req, res) => {
//     upload(req, res, async (err) => {
//         if (err) {
//             console.error("Upload error:", err);
//             return res.status(400).json({ error: err.message || "Upload failed" });
//         }

//         const files = req.files || [];
//         if (!files.length) return res.status(400).json({ error: "No files uploaded" });

//         const jobId = uuidv4();
//         const jobDir = path.join(UPLOAD_ROOT, jobId);

//         try {
//             await ensureDir(jobDir);
//             for (const f of files) {
//                 const dest = path.join(jobDir, f.originalname);
//                 await writeFile(dest, f.buffer);
//             }
//             res.json({ jobId, message: `Saved ${files.length} file(s).` });
//         } catch (e) {
//             console.error("Saving files failed:", e);
//             res.status(500).json({ error: "Could not save files" });
//         }
//     });
// });

// Process resumes via SSE
// router.get("/process-resumes-files", async (req, res) => {
//     const jobId = req.query.jobId;
//     if (!jobId) return res.status(400).send("Missing jobId");

//     const jobDir = path.join(UPLOAD_ROOT, jobId);

//     // SSE headers
//     res.writeHead(200, {
//         "Content-Type": "text/event-stream",
//         "Cache-Control": "no-cache",
//         Connection: "keep-alive",
//     });

//     const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

//     try {
//         if (!fs.existsSync(jobDir)) {
//             send({ progress: null, message: `✖ Job ${jobId} not found.` });
//             return res.end();
//         }

//         const files = await fsp.readdir(jobDir);
//         if (!files.length) {
//             send({ progress: null, message: "✖ No files to process." });
//             return res.end();
//         }

//         send({ progress: 0, message: `Found ${files.length} file(s). Starting...` });

//         for (let i = 0; i < files.length; i++) {
//             const filename = files[i];
//             const filePath = path.join(jobDir, filename);
//             const percentBase = Math.floor((i / files.length) * 100);

//             send({ progress: percentBase, message: `[${i + 1}/${files.length}] Processing “${filename}”…` });

//             // Extract text
//             let text = "";
//             try {
//                 text = await extractTextFromResume(filePath);
//             } catch (err) {
//                 send({ message: `⚠ Error extracting ${filename}: ${err.message}` });
//                 continue;
//             }

//             if (!text.trim()) {
//                 send({ message: `✖ No text extracted; skipping ${filename}.` });
//                 continue;
//             }

//             send({ message: `✔ Text extracted from ${filename}. Sending to ML API...` });

//             // Call ML API (running on port 5005)
//             try {
//                 const mlRes = await fetch(ML_API_URL, {
//                     method: "POST",
//                     headers: { "Content-Type": "application/json" },
//                     body: JSON.stringify({ resumeText: text }),
//                 });

//                 if (!mlRes.ok) {
//                     send({ message: `✖ ML API failed for ${filename}: ${mlRes.statusText}` });
//                     continue;
//                 }

//                 const mlData = await mlRes.json();
//                 send({
//                     message: `✔ Metadata for ${filename}: ${JSON.stringify(mlData).slice(0, 800)}`,
//                 });
//             } catch (err) {
//                 send({ message: `⚠ ML API error for ${filename}: ${err.message}` });
//                 continue;
//             }
//         }

//         send({ progress: 100, message: "✔ All resumes processed." });
//     } catch (err) {
//         send({ message: `⚠ Error: ${err.message}` });
//     } finally {
//         await removeDir(jobDir);
//         send({ message: `ℹ️ Cleaned up job files.` });
//         res.end();
//     }
// });

module.exports = router;
