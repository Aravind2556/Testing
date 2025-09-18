const mongoose = require('mongoose')

const userSchema = mongoose.Schema({
    id: {type: String, required: true, trim: true},
    fullName: { type: String, required: true, trim: true },    
    email: { type: String, required: true, lowercase: true, trim: true, match: /^\S+@\S+\.\S+$/ },  
    contact: { type: Number,  validate: { validator: v => !v ||  /^\d{10}$/.test(v), message: 'Contact must be a 10-digit number.' } },  
    role: {type: String, enum: ['superadmin', 'admin', 'employer', 'job-seeker'], required: true, default: 'job-seeker', lowercase: true, trim: true},
    password: {type: String, required: true},
    isApproval : {type : Boolean , default : false},
    isAgree : {type : Boolean , dafault : false},
    deviceInfos: [
        {
            fingerPrintId: { type: String },
            browserName: { type: String },
            ipAddress: { type: String },
            recentLoggedTime: [{ type: Date }]
        }
    ],
    profileViewCount : {type : Number , default : 0},
    resumeViewCount: { type: Number, default: 0 },
    resumeDownloadCount: { type: Number, default: 0 },
    profileViewHistory: [
        {
            candidateId: { type: String, unique: true, sparse: true}, 
            viewedAt : {type : [Date]}            
        }
    ],
    //field to store candidate's profile views - Candidate ID as String
    resumeViewHistory: [
        {
            candidateId: { type: String, unique: true },
            viewedAt: { type: [Date] }
        }
    ], //field to store candidate's resume views - Candidate ID as String
    resumeDownloadHistory: [
        {
            candidateId: { type: String, unique: true },
            viewedAt: { type: [Date] }
        }
    ] //field to store candidate's resume downloads - Candidate ID as String
})


const userModel = mongoose.model('candidate-portal-v1-users', userSchema)

module.exports = userModel