const mongoose = require('mongoose');
const { Schema } = mongoose;
const Candidate = require('./Candidate')
const Job = require('./Job')

const applicationSchema = new Schema({
    id: { type: String, unique: true, trim: true, lowercase: true},
    candidate: { type: Schema.Types.ObjectId, ref: Candidate, required: true },
    job: { type: Schema.Types.ObjectId, ref: Job, required: true },
    status: { type: String, enum: ['applied', 'saved', 'withdrawn'], default: 'applied' },
    hiringStatus: { type: String, enum: ['holded', 'rejected', 'shortlisted', 'hired'] },
    applicationStatus: { type: Boolean},
    saveStatus: { type: Boolean},
    appliedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

const Applications = mongoose.model('candidate-portal-v1-applications', applicationSchema);

module.exports = Applications