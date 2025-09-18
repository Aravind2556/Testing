const mongoose = require('mongoose');
const Employer = require('./Employer')
const { Schema, model } = mongoose;

const jobSchema = new Schema({
    id: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    skills: [{ type: String, trim: true }],
    requirements: [{ type: String, trim: true }],
    experience: {
        min: { type: Number, required: true },
        max: { type: Number, required: true }
    },
    salary: {
        min: { type: Number, required: true },
        max: { type: Number, required: true }
    },
    location: {
        type: { type: String, enum: ['onsite', 'remote', 'hybrid'], required: true },
        city: { type: String, trim: true }
    },
    industry: { type: String, required: true, trim: true },
    employmentType: { type: String, enum: ['ft', 'pt', 'contract'], required: true },
    deadline: { type: Date, required: true },
    status: { type: String, enum: ['draft', 'live', 'expired'], default: 'draft' },
    isEnable: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: Employer.modelName, required: true },
}, {
    timestamps: true
});

const Job = model('candidate-portal-v1-jobs', jobSchema);

module.exports = Job