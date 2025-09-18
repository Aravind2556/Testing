const Express = require('express')
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const multer = require('multer');
const isAuth = require('../../../middleware/isAuth')
const UserModel = require('../../../models/User')
const CandidateModel = require('../../../models/Candidate')
const EmployerModel = require('../../../models/Employer')
const CommentsModel = require('../../../models/Comments')

const router = Express.Router()

const RESUME_DIR = path.join(__dirname, '../../../uploads/resumes');

// Ensure resumes folder exists
fs.mkdir(RESUME_DIR, { recursive: true }).catch(() => { });

// Multer storage config (temporary name, we’ll rename later)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, RESUME_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// helper: generate unique token-based name
function generateToken() {
    const buf = crypto.randomBytes(18).toString('base64url');
    const extra = crypto.randomBytes(1).toString('hex');
    return (buf + extra).slice(0, 25);
}

// 📌 Resume Upload
router.post('/upload-candidate-resume/:candidateId', isAuth, upload.single('resume'), async (req, res) => {
    try {
        const { candidateId } = req.params;
        const role = req.session.user.role || "";
        if (!["employer", "admin"].includes(role)) {
            return res.status(403).json({ success: false, message: "Permission denied" });
        }

        const candidate = await CandidateModel.findById(candidateId);
        if (!candidate) {
            return res.status(404).json({ success: false, message: "Candidate not found" });
        }

        const file = req.file;
        const ext = path.extname(file.originalname).toLowerCase();
        
        const newName = generateToken() + ext;
        const dest = path.join(RESUME_DIR, newName);

        // rename file
        await fs.rename(file.path, dest);

        // delete old resume if exists
        if (candidate.resumeLink) {
            const oldPath = path.join(__dirname, '../../../', candidate.resumeLink);
            fs.unlink(oldPath).catch(() => { });
        }

        // update candidate db
        candidate.resumeAvailable = true;
        candidate.resumeLink = path.join('uploads', 'resumes', newName);
        candidate.newResumeStatus = true;
        candidate.newResumeUploadOn = new Date();
        await candidate.save();

        res.json({ success: true, message: "Resume uploaded successfully", resumeLink: candidate.resumeLink, uploadedOn: candidate.newResumeUploadOn });

    } catch (err) {
        console.error("Resume upload error:", err);
        res.status(500).json({ success: false, message: "Error uploading resume" });
    }
});

// 📌 Add Comment
router.post('/candidate/:candidateId/comment', isAuth, async (req, res) => {
    try {
        const { candidateId } = req.params;
        const { message } = req.body;

        if (!message || message.trim().length < 2) {
            return res.status(400).json({ success: false, message: "Comment too short" });
        }

        const user = req.session.user;
        let commentDoc = await CommentsModel.findOne({ candidateId });

        const newComment = {
            message,
            commentedBy: user._id,
            commentedByName: `${user.firstName} ${user.lastName}`,
            commentedOn: new Date()
        };

        if (!commentDoc) {
            commentDoc = new CommentsModel({ candidateId, comments: [newComment] });
        } else {
            commentDoc.comments.push(newComment);
        }
        await commentDoc.save();

        res.json({ success: true, message: "Comment added", comments: commentDoc.comments });

    } catch (err) {
        console.error("Comment add error:", err);
        res.status(500).json({ success: false, message: "Error adding comment" });
    }
});

// 📌 Fetch Comments
router.get('/candidate/:candidateId/comments', isAuth, async (req, res) => {
    try {
        const { candidateId } = req.params;
        const comments = await CommentsModel.findOne({ candidateId }).lean();
        res.json({ success: true, comments: comments ? comments.comments : [] });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching comments" });
    }
});

router.get('/candidate/comments', isAuth, async (req, res) => {
    try {
       
        const comments = await CommentsModel.find();
        res.json({ success: true, comments: comments });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching comments" });
    }
});

module.exports = router