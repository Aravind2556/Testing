const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
    skillName: { type: String, required: true, trim: true, lowercase: true }
});

// avoid model overwrite on hot reload
module.exports = mongoose.models.Skill || mongoose.model('Skill', skillSchema);
