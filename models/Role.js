const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const RoleSchema = new Schema({
    id: {type: String, unique: true, trim: true, lowercase: true},
    industryId: {type: String, trim: true, lowercase: true},
    DepartmentId: {type: String, trim: true, lowercase: true},
    role: {type: String, trim: true, lowercase: true}
})

const ResumeRefModel = model('candidate-portal-v1-role', RoleSchema)

module.exports = ResumeRefModel