const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose')
const Employer = require('../../../models/Employer');
const router = express.Router();

// Multer setup for logo upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `logo_${Date.now()}${ext}`);
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 2MB max
});

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'];
const isValidURL = u => /^https?:\/\/\S+\.\S+$/.test(u);

// Assumes req.user._id is set by authentication middleware
router.post(
    '/update-employer',
    upload.single('companyLogo'),
    async (req, res) => {
        try {
            const {
                userId,
                companyName,
                companyWebsite,
                industry,
                companySize,
                addressLine1,
                addressLine2,
                city,
                state,
                country,
                zipCode,
                description
            } = req.body;


            // 1) Validate required strings
            const errors = [];
            if (!mongoose.isValidObjectId(userId)) errors.push("UserId is not found!")
            if (!companyName?.trim()) errors.push('companyName is required.');
            if (!companyWebsite?.trim() || !isValidURL(companyWebsite))
                errors.push('Valid companyWebsite is required.');
            if (!industry?.trim()) errors.push('industry is required.');
            if (!COMPANY_SIZES.includes(companySize))
                errors.push('companySize must be one of the allowed values.');
            if (!addressLine1?.trim()) errors.push('addressLine1 is required.');
            if (!city?.trim()) errors.push('city is required.');
            if (!state?.trim()) errors.push('state is required.');
            if (!country?.trim()) errors.push('country is required.');
            if (!zipCode?.trim() || !/^\d{3,10}$/.test(zipCode))
                errors.push('Valid zipCode (3–10 digits) is required.');
            // description optional

            if (errors.length) {
                return res
                    .status(400)
                    .json({ success: false, message: errors.join(' ') });
            }

            // 2) Build update object
            const update = {
                companyName: companyName.trim(),
                companyWebsite: companyWebsite.trim().toLowerCase(),
                industry: industry.trim(),
                companySize,
                headquarters: {
                    addressLine1: addressLine1.trim(),
                    addressLine2: addressLine2?.trim() || '',
                    city: city.trim(),
                    state: state.trim(),
                    country: country.trim(),
                    zipCode: zipCode.trim()
                },
                description: description?.trim() || ''
            };

            // 3) Handle new logo upload
            if (req.file) {
                update.companyLogo = `/uploads/${req.file.filename}`;
            }

            // 4) Persist
            const employer = await Employer.findOneAndUpdate(
                { user: userId },
                {
                    // apply all updated fields
                    $set: update,
                    // on insert, also set the user reference
                    $setOnInsert: { user: userId }
                },
                {
                    new: true,   // return the updated *or* newly created document
                    upsert: true // create if it doesn't exist
                }
            );
            if (!employer) {
                return res
                    .status(404)
                    .json({ success: false, message: 'Employer not found.' });
            }

            return res.json({
                success: true,
                message: 'Employer profile updated successfully.',
                employer
            });
        } catch (err) {
            console.log('Error in updating Employer:', err);
            return res
                .status(500)
                .json({
                    success: false,
                    message:
                        'Trouble in updating Employer! Please contact support team or try again later.'
                });
        }
    }
);

module.exports = router;
