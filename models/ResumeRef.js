const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const ResumeRefSchema = new Schema({
    pushedResumes: {type: [Number]},
    failedResumes: {type: [Number]},
    existingResumes: {type: [Number]}
})

const ResumeRefModel = model('candidate-portal-v1-resumeref', ResumeRefSchema)

module.exports = ResumeRefModel