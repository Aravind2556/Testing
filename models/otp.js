const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const OtpSchema = new Schema({
    email: { type: String, required: true, lowercase: true, trim: true },
    otp: { type: Number, required: true },
    expiresAt: { type: Date, required: true }
})

module.exports = model("candidate-portal-v1-otp", OtpSchema)