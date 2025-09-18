const userModel = require('./User')
const mongoose = require('mongoose');
const { Schema } = mongoose;

const employerSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: userModel, required: true, unique: true },
  companyName: { type: String, required: true, trim: true },
  companyWebsite: { type: String, trim: true, lowercase: true },
  companyLogo: { type: String, trim: true, lowercase: true },
  industry: { type: String, trim: true },
  companySize: { type: String, enum: ['1-10','11-50','51-200','201-500','501-1000','1001+'] },
  headquarters: {
    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true },
    city:          { type: String, trim: true },
    state:         { type: String, trim: true },
    country:       { type: String, trim: true },
    zipCode:       { type: String, trim: true }
  },
  description: { type: String, trim: true }
}, {
  timestamps: true
});

const Employer = mongoose.model('candidate-portal-v1-employers', employerSchema);

module.exports = Employer; 
