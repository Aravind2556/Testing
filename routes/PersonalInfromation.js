// const CandidateModel = require('../../../models/Candidate')
// const multer = require('multer')
// const path = require('path');
// const capitalizeFirstLetter = require('../../../utils/IntialLetterCaps');
// const toTitleCase = require('../../../utils/toTitleCase');
// const getNextCandidateID = require('../../../utils/getNextCandidateID');

// const personal = express.Router()


// // Multer setup
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => cb(null, 'uploads/'),
//     filename: (req, file, cb) => {
//         const ext = path.extname(file.originalname);
//         // use different prefixes based on fieldname
//         const prefix = file.fieldname === 'profilePic';
//         cb(null, `${prefix}_${Date.now()}${ext}`)
//     }
// });

// const upload = multer({
//     storage,
//     fileFilter: (req, file, cb) => {
//         // resume => allow docs/pdf, profilePic => only images
//         if (file.fieldname === 'resume') {
//             if (!/\.(jpg|jpeg|png)$/i.test(file.originalname))
//                 return cb(new Error('Only JPG/JPEG/PNG allowed for resume'), false);
//         } else {
//             if (!file.mimetype.startsWith('image/'))
//                 return cb(new Error('Only images allowed for profilePic'), false);
//         }
//         cb(null, true)
//     },
//     limits: { fileSize: 5 * 1024 * 1024 } // max 5MB
// })
// // allowed enums
// const GENDERS = ['female', 'male', 'other'];
// const MARITALS = ['single', 'married', 'divorced', 'widowed'];
// // const PROFICIENCY = ['beginner', 'intermediate', 'advanced'];
// const PROFICIENCY = ["basic", "conversational", "fluent", "native"];
// personal.post('/create-candidate/personalInfo', upload.single('profilePic'), async (req, res) => {
//     try {
//         const { firstName, middleName, lastName, applicantName, emailAddress, alternateEmailAddress, phoneNumber, alternatePhoneNumber, dateOfBirth, gender, maritalStatus, disability, languages } = req.body

//         let phone, langs, altPhone
//         try {
//             // phone = typeof phoneNumber === 'string' ? JSON.parse(phoneNumber) : phoneNumber;
//             // altPhone = typeof alternatePhoneNumber === 'string' ? JSON.parse(alternatePhoneNumber) : alternatePhoneNumber;
//             disab = typeof disability === 'string' ? JSON.parse(disability) : disability;

//             langs = typeof languages === 'string' ? JSON.parse(languages) : languages;
//         } catch (e) {
//             return res.status(400).json({ success: false, message: 'Malformed JSON in one of the nested fields.' });
//         }

//         const errors = []
//         if (!firstName || firstName.trim().length < 3)
//             errors.push('firstName must be at least 3 characters.');
//         if (!lastName || lastName.trim().length < 1)
//             errors.push('lastName is required.');
//         if (!applicantName || applicantName.trim().length < 3)
//             errors.push('applicantName must be at least 3 characters.');

//         if (!emailAddress || !isValidEmail(emailAddress))
//             errors.push('Valid emailAddress is required.');
//         if (alternateEmailAddress && !isValidEmail(alternateEmailAddress))
//             errors.push('alternateEmailAddress is invalid.');


//         if (!Array.isArray(langs))
//             errors.push('languages must be an array.');
//         else {
//             langs.forEach((lang, i) => {
//                 if (!lang.name) errors.push(`languages[${i}].name is required.`);
//                 if (!isValidEnum(lang.proficiency, PROFICIENCY))
//                     errors.push(`languages[${i}].proficiency must be one of [${PROFICIENCY.join(', ')}].`);
//                 ['read', 'write', 'speak'].forEach(flag => {
//                     if (typeof lang[flag] !== 'boolean')
//                         errors.push(`languages[${i}].${flag} must be true or false.`);
//                 });
//             });
//         }

//         if (errors.length) {
//             let errorStr = ""
//             errors.forEach(err => {
//                 if (err) {
//                     errorStr += err
//                 }
//             })
//             return res.status(400).json({ success: false, message: errorStr });
//         }


//         // 3) Build update object
//         const update = {
//             firstName: capitalizeFirstLetter(firstName),
//             middleName: middleName ? capitalizeFirstLetter(middleName) : '',
//             lastName: capitalizeFirstLetter(lastName),
//             applicantName: toTitleCase(applicantName),
//             emailAddress: emailAddress.toLowerCase(),
//             alternateEmailAddress: alternateEmailAddress?.toLowerCase() || '',
//             phoneNumber: {
//                 countryCode: +phone.countryCode || 91,
//                 number: +phone.number
//             },
//             alternatePhoneNumber: {
//                 countryCode: +altPhone.countryCode || undefined,
//                 number: +altPhone.number || undefined
//             },
//             dateOfBirth: new Date(dateOfBirth),
//             gender: gender.toLowerCase(),
//             maritalStatus: maritalStatus.toLowerCase(),
//             disability: {
//                 isDisabled: disab.isDisabled,
//                 desc: disab.desc?.trim() || ''
//             },

//             languages: langs,
//             updatedOn: new Date()
//         };
//         // if a new file was uploaded, set profilePicLink
//         if (req.file) {
//             update.profilePicLink = `/uploads/${req.file.filename}`;
//         }
//         update.candidateID = await getNextCandidateID()
//         update.user = req.session.user._id

//         // Create new candidate
//         candidate = await CandidateModel.create(update);
//         return res.status(201).json({
//             success: true,
//             message: "Successfully create the Personal Info",
//             candidate
//         });
//     }
//     catch (err) {

//     }
// })




// module.exports = personal