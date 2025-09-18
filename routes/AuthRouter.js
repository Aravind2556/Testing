const Express = require('express')
const mongoose = require('mongoose')
const UserModel = require('../models/User')
const CandidateModel = require('../models/Candidate')
const EmployerModel = require('../models/Employer')
const isAuth = require('../middleware/isAuth')
const isAdmin = require('../middleware/isAdmin')
const bcrypt = require('bcrypt');
const OtpModel = require('../models/otp')
const sendMail = require('../utils/SendEmail')
const initialLetterCaps = require('../utils/IntialLetterCaps')
const NotificationModel = require('../models/Notification')
const SessionLogsModel = require('../models/SessionLogs')

// Function to Generate OTP
const generateOTP = (length = 6) => {
    return Math.floor(100000 + Math.random() * 900000)
}

const AuthRouter = Express.Router()

AuthRouter.post('/signin', async (req, res) => {
    try {
        const { email, password,fingerPrintId, browserName, ipAddress } = req.body
        if (!email || !password ) {
            return res.send({ success: false, message: 'Please provide all details!' })
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.send(400).json({ success: false, message: "Please provide a valid email address!" })
        }

        const user = await UserModel.findOne({ email })

        if (!user) {
            return res.send({ success: false, message: 'Invalid Email or Password!' })
        }

        // const isMatchPassword = await bcrypt.compare(password, user.password)

        // if (!isMatchPassword) {
        //     return res.send({ success: false, message: "Invalid Email or Password!" })
        // }
     
        if (user.role === "employer") {

            if (!fingerPrintId || !browserName || !ipAddress) {
                return res.send({ success: false, message: 'Device details required for Employer login!' });
            }

            // check device
            let existingDevice = user.deviceInfos.find(
                d => d.fingerPrintId === fingerPrintId &&
                    d.browserName === browserName &&
                    d.ipAddress === ipAddress
            );

            if (existingDevice) {    
                console.log("Existing Device Found - updating recentLoggedTime and session logs");                         
                existingDevice.recentLoggedTime.push(new Date());          
            } else {
                user.deviceInfos.push({
                    fingerPrintId,
                    browserName,
                    ipAddress,
                    recentLoggedTime: [new Date()]
                });

                // Notification only for new device
                const admins = await UserModel.find({ role: 'admin' });
                if (admins && admins.length > 0) {
                    const notifications = admins.map(admin => ({
                        userId: admin.id,
                        title: "New Device Login",
                        description: `Employer ${user.firstName} (${user.email}) logged in from NEW device → ${browserName} / ${ipAddress}`,
                        type: "device-status"
                    }));
                    await NotificationModel.insertMany(notifications);
                }
            }

            await user.save();

            // 🔔 Notification for ALL admins (both new & existing devices)
            try {
                const admins = await UserModel.find({ role: 'admin' });
                if (admins && admins.length > 0) {
                    const notifications = admins.map(admin => ({
                        userId: admin._id,
                        title: "Employer Login",
                        description: `Employer ${user.firstName} (${user.email}) logged in from ${browserName} / ${ipAddress}`,
                        type: "device-status"
                    }));
                    await NotificationModel.insertMany(notifications);
                }
            } catch (notifyErr) {
                console.error("Failed to create notification:", notifyErr);
            }

            const sessionLogEntry = new SessionLogsModel({
                userId: user?.id,
                browserName,
                status: 'in',
                ipAddress
            })
            await sessionLogEntry.save()
        }


        req.session.user = {
            _id: user._id,
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName || "",
            contact: user.contact,
            email: user.email,
            role: user.role,
            fingerPrintId:  fingerPrintId,   
            browserName :browserName,     
            ipAddress :ipAddress        
        }

        req.session.save((err) => {
            if (err) {
                return res.send({ success: false, message: "Failed to create session!" })
            }

            return res.send({ success: true, message: "Logged in successfully!", user: req.session.user })
        })

    }
    catch (err) {
        console.log("Error in login:", err)
        return res.send({ success: false, message: 'Trouble in login! Please contact support Team.' })
    }
})



AuthRouter.post('/send-otp', async (req, res) => {
    try {
        let { email, purpose } = req.body
        console.log("email",email)

        if (!email) {
            return res.status(400).json({ success: false, message: 'Please provide your Email!' })
        }

        if (!purpose) {
            return res.status(400).json({ success: false, message: 'Function type is not avalible!please contact support team' })
        }
        
        email = email.toLowerCase()

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: "Please provide a valid email address!" })
        }

        const fetchUser = await UserModel.findOne({ email })
        if (purpose === 'signup' && fetchUser) {
            return res.status(400).json({ success: false, message: 'Account already exist! Please try signin.' })
        }
        else if (purpose === 'forgot-password' && !fetchUser) {
            return res.status(400).json({ success: false, message: 'No Accounts are associated with this Email! Please signup.' })
        }

        const otp = generateOTP()
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // expires in 5 mins

        if (!expiry) {
            return res.status(500).json({ success: false, message: 'Failed to set OTP Expiry! Please contact suport Team.' })
        }

        if (!otp || otp?.toString().length !== 6) {
            return res.status(500).json({ success: false, message: 'Failed to generate OTP! Please contact suport Team.' })
        }

        const updateOtp = await OtpModel.updateOne(
            { email },
            {
                $set: { otp, expiresAt: expiry }
            },
            { upsert: true }
        )

        if (!updateOtp) {
            return res.status(500).json({ success: false, message: 'Failed to update OTP! Please contact support Team.' })
        };

        const isMailSent = await sendMail(email, otp, purpose)

        if (!isMailSent) {
            return res.status(500).json({ success: false, message: 'Failed to send OTP to Mail! Please contact support Team.' })
        }


        return res.status(201).json({ success: true, message: 'OTP sent sucessfully!' })
    }
    catch (err) {
        console.log("Error in Sending OTP:", err)
        return res.status(404).json({ success: false, message: 'Trouble in Sending OTP! Please contact support Team.' })
    }
})

// AuthRouter.post('/signup', async (req, res) => {
//     try {
//         let { firstName, lastName, email, contact, password, selectedRole, otp } = req.body

//         if (!firstName || !lastName || !email || !contact || !password || !selectedRole || !otp) {
//             return res.send({ success: false, message: 'Please provide all details!' })
//         }
//         otp = Number(otp)

//         const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//         if (!emailRegex.test(email)) {
//             return res.send(400).json({ success: false, message: "Please provide a valid email address!" })
//         }

//         const fetchUser = await UserModel.findOne({ email: email.toLowerCase() })
//         if (fetchUser) {
//             return res.send({ success: false, message: 'Account already exist! Please try signin.' })
//         }

//         if (firstName.length < 3) {
//             return res.send(400).json({ success: false, message: "Please enter atleast 3 characters for First Name!" })
//         }

//         const contactRegex = /^\d{10}$/;
//         if (typeof contact === 'string') {
//             if (!contactRegex.test(contact)) {
//                 return res.send(400).json({ success: false, message: "Invalid contact number! kindly provide valid 10 digit contact." })
//             }
//         }
//         else if (typeof contact === 'number') {
//             if (!contactRegex.test(contact.toString())) {
//                 return res.send(400).json({ success: false, message: "Invalid contact number! kindly provide valid 10 digit contact." })
//             }
//         }
//         else {
//             return res.send(400).json({ success: false, message: "Invalid contact!" })
//         }

//         const passwordErrors = [];

//         if (password.length < 8) {
//             passwordErrors.push("at least 8 characters");
//         }
//         if (!/[A-Z]/.test(password)) {
//             passwordErrors.push("an uppercase letter");
//         }
//         if (!/[a-z]/.test(password)) {
//             passwordErrors.push("a lowercase letter");
//         }
//         if (!/\d/.test(password)) {
//             passwordErrors.push("a number");
//         }
//         if (!/[\W_]/.test(password)) {
//             passwordErrors.push("a special character");
//         }

//         if (passwordErrors.length > 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: `Password must contain ${passwordErrors.join(", ")}.`
//             });
//         }

//         if (typeof otp !== 'number') {
//             return res.status(400).json({ success: false, message: "OTP must consist only Numbers!" })
//         }

//         if (otp.toString().length !== 6) {
//             return res.status(400).json({ success: false, message: "OTP must be exactly 6 digits!" })
//         }

//         const otpEntry = await OtpModel.findOne({ email });
//         if (!otpEntry) return res.status(400).json({ success: false, message: "OTP not found. Please request a new one." });

//         if (otpEntry.expiresAt < new Date()) {
//             await OtpModel.deleteOne({ email });
//             return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
//         }

//         if (otpEntry.otp !== otp) {
//             return res.status(400).json({ success: false, message: "Invalid OTP!" });
//         }

//         await OtpModel.deleteOne({ email })

//         let Users = await UserModel.find({});
//         let userId;
//         if (Users.length > 0) {
//             let lastUser = Users.slice(-1)[0];

//             let lastIdNum = parseInt(lastUser.id?.replace('sanuser', '')) || 0;

//             userId = `sanuser${lastIdNum + 1}`;
//         } else {
//             userId = 'sanuser1';
//         }

//         const saltRounds = Number(process.env.saltRounds) || 12
//         const hashedPassword = await bcrypt.hash(password, saltRounds)

//         if (!hashedPassword) {
//             return res.status(500).json({ success: false, message: "Failed to process Password! Please contact support Team." })
//         }

//         const newUser = new UserModel({
//             id: userId,
//             firstName: initialLetterCaps(firstName),
//             email: email,
//             contact: contact,
//             password: hashedPassword,
//             role: selectedRole.toLowerCase(),
//             ...(lastName && { lastName: initialLetterCaps(lastName) })
//         })

//         const saveUser = await newUser.save()

//         if (saveUser) {

//             const checkProfile = await CandidateModel.find({ emailAddress: email.toLowerCase().trim() })


//             if (checkProfile) {
//                 const linkUserId = await CandidateModel.updateOne({ emailAddress: email.toLowerCase().trim() }, { $set: { user: saveUser._id } })
//                 if (!linkUserId) {
//                     return res.send({ success: false, message: "User succesfully created! Failed to link candidate profile, please contact Support team." })
//                 }
//             }

//             req.session.user = {
//                 _id: saveUser._id,
//                 id: saveUser.id,
//                 firstName: saveUser.firstName,
//                 lastName: saveUser.lastName || "",
//                 email: saveUser.email,
//                 contact: saveUser.contact,
//                 role: saveUser.role,
//             }

//             req.session.save((err) => {
//                 if (err) {
//                     return res.send({ success: false, message: "Failed to create session!" })
//                 }

//                 return res.send({ success: true, message: "User Registration successfully!", user: req.session.user })
//             })

//         }
//         else {
//             return res.send({ success: false, message: 'Failed to create User!' })
//         }

//     }
//     catch (err) {
//         console.log("Error in Register:", err)
//         return res.send({ success: false, message: 'Trouble in Registration! Please contact admin.' })
//     }
// })


AuthRouter.post('/signup', async (req, res) => {
    try {
        let { fullName, email, contact, password, otp, isAgree, isApproval } = req.body
        console.log("data", fullName, email, contact, password, otp, isAgree, isApproval)

        if (!fullName || !email || !contact || !password || !otp || !isAgree || !isApproval) {
            return res.send({ success: false, message: 'Please provide all details!' })
        }
        otp = Number(otp)

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.send(400).json({ success: false, message: "Please provide a valid email address!" })
        }

        const fetchUser = await UserModel.findOne({ email: email.toLowerCase() })
        if (fetchUser) {
            return res.send({ success: false, message: 'Account already exist! Please try signin.' })
        }

        if (fullName.length < 3) {
            return res.send(400).json({ success: false, message: "Please enter atleast 3 characters for First Name!" })
        }

        const contactRegex = /^\d{10}$/;
        if (typeof contact === 'string') {
            if (!contactRegex.test(contact)) {
                return res.send(400).json({ success: false, message: "Invalid contact number! kindly provide valid 10 digit contact." })
            }
        }
        else if (typeof contact === 'number') {
            if (!contactRegex.test(contact.toString())) {
                return res.send(400).json({ success: false, message: "Invalid contact number! kindly provide valid 10 digit contact." })
            }
        }
        else {
            return res.send(400).json({ success: false, message: "Invalid contact!" })
        }

        const passwordErrors = [];

        if (password.length < 8) {
            passwordErrors.push("at least 8 characters");
        }
        if (!/[A-Z]/.test(password)) {
            passwordErrors.push("an uppercase letter");
        }
        if (!/[a-z]/.test(password)) {
            passwordErrors.push("a lowercase letter");
        }
        if (!/\d/.test(password)) {
            passwordErrors.push("a number");
        }
        if (!/[\W_]/.test(password)) {
            passwordErrors.push("a special character");
        }

        if (passwordErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Password must contain ${passwordErrors.join(", ")}.`
            });
        }

        if (typeof otp !== 'number') {
            return res.status(400).json({ success: false, message: "OTP must consist only Numbers!" })
        }

        if (otp.toString().length !== 6) {
            return res.status(400).json({ success: false, message: "OTP must be exactly 6 digits!" })
        }

        const otpEntry = await OtpModel.findOne({ email });
        if (!otpEntry) return res.status(400).json({ success: false, message: "OTP not found. Please request a new one." });

        if (otpEntry.expiresAt < new Date()) {
            await OtpModel.deleteOne({ email });
            return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
        }

        if (otpEntry.otp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP!" });
        }

        await OtpModel.deleteOne({ email })

        let Users = await UserModel.find({});
        let userId;
        if (Users.length > 0) {
            let lastUser = Users.slice(-1)[0];

            let lastIdNum = parseInt(lastUser.id?.replace('sanuser', '')) || 0;

            userId = `sanuser${lastIdNum + 1}`;
        } else {
            userId = 'sanuser1';
        }

        const saltRounds = Number(process.env.saltRounds) || 12
        const hashedPassword = await bcrypt.hash(password, saltRounds)

        if (!hashedPassword) {
            return res.status(500).json({ success: false, message: "Failed to process Password! Please contact support Team." })
        }

        const newUser = new UserModel({
            id: userId,
            fullName: initialLetterCaps(fullName),
            email: email,
            contact: contact,
            password: hashedPassword,
            role: isApproval ? "job-seeker" : "employer",
            isAgree,
            isApproval        
        })

        const saveUser = await newUser.save()

        if (saveUser) {

            const checkProfile = await CandidateModel.find({ emailAddress: email.toLowerCase().trim() })


            if (checkProfile) {
                const linkUserId = await CandidateModel.updateOne({ emailAddress: email.toLowerCase().trim() }, { $set: { user: saveUser._id } })
                if (!linkUserId) {
                    return res.send({ success: false, message: "User succesfully created! Failed to link candidate profile, please contact Support team." })
                }
            }

            req.session.user = {
                _id: saveUser._id,
                id: saveUser.id,
                fullName: saveUser.fullName,
                email: saveUser.email,
                contact: saveUser.contact,
                role: saveUser.role,
                isAgree: saveUser.isAgree,
                isApproval: saveUser.isApproval
            }

            req.session.save((err) => {
                if (err) {
                    return res.send({ success: false, message: "Failed to create session!" })
                }

                return res.send({ success: true, message: "User Registration successfully!", user: req.session.user })
            })

        }
        else {
            return res.send({ success: false, message: 'Failed to create User!' })
        }

    }
    catch (err) {
        console.log("Error in Register:", err)
        return res.send({ success: false, message: 'Trouble in Registration! Please contact admin.' })
    }
})

AuthRouter.get('/checkauth', async (req, res) => {
    try {
        if (req.session.user) {

            const fetchUser = await UserModel.findOne({ email: req.session.user.email.toLowerCase() }).select("-password")
            if (!fetchUser) {
                return res.send({ success: false, message: 'User not found!' })
            }
            return res.send({ success: true, user: fetchUser, message: "Successfully fetched the current logged in User!" })
        }
        else {
            return res.send({ success: false, message: "No loggin detected! please login and try again." })
        }
    }
    catch (err) {
        console.log("Error in Checking Authentication:", err)
        return res.send({ success: false, message: 'Trouble in Checking Authentication! Please contact support Team.' })
    }
})

AuthRouter.post('/update-password', isAuth, async (req, res) => {
    try {
        const { currentPassword, password } = req.body

        if (!currentPassword || !password) {
            return res.status(400).send({ success: false, message: "Current Password and New Password is required!" })
        }

        if (req.session.user) {

            const fetchUser = await UserModel.findOne({ email: req.session.user.email })
            if (!fetchUser) {
                return res.status(401).json({ success: false, message: 'User not found!' })
            }

            const isPasswordMatch = await bcrypt.compare(currentPassword, fetchUser.password)

            if (!isPasswordMatch) {
                return res.status(401).json({ success: false, message: 'Incorrect Password!' })
            }

            const saltRounds = Number(process.env.saltRounds) || 12
            const hashedPassword = await bcrypt.hash(password, saltRounds)

            if (!hashedPassword) {
                return res.status(500).json({ success: false, message: "Failed to process Password! Please contact support Team or try again later." })
            }

            const updatePassword = await UserModel.updateOne({ email: req.session.user.email }, {
                $set: { password: hashedPassword }
            })

            if(!updatePassword){
                return res.status(500).json({ success: false, message: "Failed to update Password! Please contact support Team or try again later." }) 
            }

            return res.send({ success: true, message: "Successfully updated the password!" })
        }
        else {
            return res.send({ success: false, message: "No loggin detected! please login and try again." })
        }
    }
    catch (err) {
        console.log("Error in Updating password:", err)
        return res.send({ success: false, message: 'Trouble in Updating password! Please contact support Team.' })
    }
})

AuthRouter.get('/logout', isAuth, async (req, res) => {
    try {
        if (req.session.user) {
            const users = req.session.user;
            console.log("Logging out user:", users);

            // 🔍 Find user
            const user = await UserModel.findOne({ id: users?.id});
            if (user && user.role === "employer") {
                const { fingerPrintId, browserName, ipAddress } = req.session.user;

                let existingDevice = user.deviceInfos.find(
                    d => d.fingerPrintId === fingerPrintId &&
                        d.browserName === browserName &&
                        d.ipAddress === ipAddress
                );

                if (existingDevice) {
                    //Initialize logOutTime if missing
                    if (!Array.isArray(existingDevice.logOutTime)) {
                        existingDevice.logOutTime = [];
                    }
                    existingDevice.logOutTime.push(new Date());
                }

                await user.save();

                const sessionLogEntry = new SessionLogsModel({
                    userId: users?.id,   
                    browserName: browserName,  
                    status: 'out',
                    ipAddress: ipAddress
                })

                await sessionLogEntry.save()

                // 🔔 Notify admins
                try {
                    const admins = await UserModel.find({ role: 'admin' });
                    if (admins && admins.length > 0) {
                        const notifications = admins.map(admin => ({
                            userId: admin.id,
                            title: "Employer Logout",
                            description: `Employer ${user.fullname} (${user.email}) logged out from ${browserName} / ${ipAddress}`,
                            type: "device-status"
                        }));
                        await NotificationModel.insertMany(notifications);
                    }
                } catch (notifyErr) {
                    console.error("Failed to create notification:", notifyErr);
                }
            }
            
            req.session.destroy((err) => {
                if (err) {
                    console.log("Error in destroying session:", err);
                    return res.send({ success: false, message: "Failed to log out! Please contact developer." });
                }
                return res.send({ success: true, message: "Logged out successfully!" });
            });
        }
        else {
            return res.send({ success: false, message: "Please login and try again later!" })
        }
    }
    catch (err) {
        console.log("Trouble in logging out:", err)
        return res.send({ success: false, message: "Trouble in logging out! Please contact support Team." })
    }
})

AuthRouter.get('/check-profile', isAuth, async (req, res) => {
  try {
    const userId = req.session.user._id;
    const role   = req.session.user.role;

    let profile = null;

    if (role === 'employer') {
      profile = await EmployerModel.findOne({ user: userId }).lean();
    } else if (role === 'job-seeker') {
      profile = await CandidateModel.findOne({ user: userId }).lean();
    }

    if (profile) {
      return res.json({
        success: true,
        profileExists: true,
        role,
        profile
      });
    } else {
      return res.json({
        success: false,
        message: `No ${role === 'employer' ? 'employer' : role === 'job-seeker' ? 'candidate' : ''} profile found`
      });
    }
  } catch (err) {
    console.log('Error in checking profile:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error while checking profile'
    });
  }
})

// Helper for email and password validation
const isValidEmail    = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPassword = pw    => pw.length >= 8;

// POST /verify-otp
// AuthRouter.post('/verify-otp', async (req, res) => {
//   try {
//     const { email, otp, purpose } = req.body;

//       console.log("verfy otp", email, otp, purpose)

//     if (!email || !otp) {
//       return res.status(400).json({ success:false, message:'Email and OTP are required.' });
//     }
//     if (!isValidEmail(email)) {
//       return res.status(400).json({ success:false, message:'Invalid email address.' });
//     }
//     // allow both "forgot-password" and "reset"
//     if (purpose !== 'forgot-password' && purpose !== 'reset' && purpose !== 'signup') {
//       return res.status(400).json({ success:false, message:'Invalid purpose.' });
//     }

//     const record = await OtpModel.findOne({ email: email.toLowerCase() });
//     if (!record) {
//       return res.status(400).json({ success:false, message:'No OTP found—please request a new one.' });
//     }
//     if (record.expiresAt < new Date()) {
//       return res.status(400).json({ success:false, message:'OTP has expired—please request a new one.' });
//     }
//     if (String(record.otp) !== String(otp)) {
//       return res.status(400).json({ success:false, message:'Incorrect OTP.' });
//     }

//     // OTP valid → delete it so it cannot be reused
//     await OtpModel.deleteOne({ _id: record._id });

//     return res.json({ success:true, message:'OTP verified successfully.' });
//   }
//   catch(err) {
//     console.error('Error in verify-otp:', err);
//     return res.status(500).json({ success:false, message:'Server error verifying OTP.' });
//   }
// });

AuthRouter.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp, purpose } = req.body;

        console.log("verfy otp", email, otp, purpose);

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email address.' });
        }
        // allow both "forgot-password", "reset", "signup"
        if (purpose !== 'forgot-password' && purpose !== 'reset' && purpose !== 'signup') {
            return res.status(400).json({ success: false, message: 'Invalid purpose.' });
        }

        const record = await OtpModel.findOne({ email: email.toLowerCase() });
        if (!record) {
            return res.status(400).json({ success: false, message: 'No OTP found—please request a new one.' });
        }
        if (record.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP has expired—please request a new one.' });
        }
        if (String(record.otp) !== String(otp)) {
            return res.status(400).json({ success: false, message: 'Incorrect OTP.' });
        }

        // ✅ OTP valid
        // delete only if NOT signup
        if (purpose !== 'signup') {
            await OtpModel.deleteOne({ _id: record._id });
        }

        return res.json({ success: true, message: 'OTP verified successfully.' });
    }
    catch (err) {
        console.error('Error in verify-otp:', err);
        return res.status(500).json({ success: false, message: 'Server error verifying OTP.' });
    }
});


// POST /reset-password
AuthRouter.post('/reset-password', async (req, res) => {
  try {
    const { email, password } = req.body;
      console.log("reset-password", email, password)
    if (!email || !password) {
      return res.status(400).json({ success:false, message:'Email and new password are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success:false, message:'Invalid email address.' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ success:false, message:'Password must be at least 8 characters.' });
    }

  const passwordErrors = [];

        if (password.length < 8) {
            passwordErrors.push("at least 8 characters");
        }
        if (!/[A-Z]/.test(password)) {
            passwordErrors.push("an uppercase letter");
        }
        if (!/[a-z]/.test(password)) {
            passwordErrors.push("a lowercase letter");
        }
        if (!/\d/.test(password)) {
            passwordErrors.push("a number");
        }
        if (!/[\W_]/.test(password)) {
            passwordErrors.push("a special character");
        }

        if (passwordErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Password must contain ${passwordErrors.join(", ")}.`
            });
        }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success:false, message:'No account found for this email.' });
    }

    const hash = await bcrypt.hash(password, 10);
    user.password = hash;
    await user.save();

    return res.json({ success:true, message:'Password has been reset successfully.' });
  }
  catch(err) {
    console.error('Error in reset-password:', err);
    return res.status(500).json({ success:false, message:'Server error resetting password.' });
  }
});

AuthRouter.post('/create-employer', isAdmin, async(req, res) =>
{
    try
    {

        let { firstName, lastName, email, contact, password} = req.body

        if (!firstName || !email ||  !password ) {
            return res.send({ success: false, message: 'Please provide all details!' })
        }
       

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.send(400).json({ success: false, message: "Please provide a valid email address!" })
        }

        const fetchUser = await UserModel.findOne({ email: email.toLowerCase() })
        if (fetchUser) {
            return res.send({ success: false, message: 'Account already exist! Please try signin.' })
        }

        if (firstName.length < 3) {
            return res.send(400).json({ success: false, message: "Please enter atleast 3 characters for First Name!" })
        }
if(contact)
{
 const contactRegex = /^\d{10}$/;
        if (typeof contact === 'string') {
            if (!contactRegex.test(contact)) {
                return res.send(400).json({ success: false, message: "Invalid contact number! kindly provide valid 10 digit contact." })
            }
        }
        else if (typeof contact === 'number') {
            if (!contactRegex.test(contact.toString())) {
                return res.send(400).json({ success: false, message: "Invalid contact number! kindly provide valid 10 digit contact." })
            }
        }
        else {
            return res.send(400).json({ success: false, message: "Invalid contact!" })
        }

}
       
        const passwordErrors = [];

        if (password.length < 8) {
            passwordErrors.push("at least 8 characters");
        }
        if (!/[A-Z]/.test(password)) {
            passwordErrors.push("an uppercase letter");
        }
        if (!/[a-z]/.test(password)) {
            passwordErrors.push("a lowercase letter");
        }
        if (!/\d/.test(password)) { 
            passwordErrors.push("a number");
        }
        
        if (!/[\W_]/.test(password)) {
            passwordErrors.push("a special character");
        }

        if (passwordErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Password must contain ${passwordErrors.join(", ")}.`
            });
        }

       

        let Users = await UserModel.find({});
        let userId;
        if (Users.length > 0) {
            let lastUser = Users.slice(-1)[0];

            let lastIdNum = parseInt(lastUser.id?.replace('sanuser', '')) || 0;

            userId = `sanuser${lastIdNum + 1}`;
        } else {
            userId = 'sanuser1';
        }

        const saltRounds = Number(process.env.saltRounds) || 12
        const hashedPassword = await bcrypt.hash(password, saltRounds)

        if (!hashedPassword) {
            return res.status(500).json({ success: false, message: "Failed to process Password! Please contact support Team." })
        }


        const newUser = new UserModel({
            id: userId,
            firstName: initialLetterCaps(firstName),
            email: email,
            password: hashedPassword,
            role: 'employer',
            ...(lastName && { lastName: initialLetterCaps(lastName) }),
             ...(contact ? { contact } : {}) 
        })

        const saveUser = await newUser.save()

        if (saveUser) {

        
                return res.send({ success: true, message: "Employer Registration successfully!", user: req.session.user })
            
        }
        else {
            return res.send({ success: false, message: 'Failed to create Employer!' })
        }
    }
    catch(err)
    {
        console.log("Error in creating employer:", err)
        return res.send({ success: false, message: 'Trouble in creating employer! Please contact support Team.' })
    }
})

AuthRouter.post('/update-EmployerPassword/:id', isAdmin, async(req, res) =>
{
    try
    {
        const {id} = req.params

        if(!id){
           
            return res.status(500).json({success: false, message: "Employer ID is not found! "})
        }

        const {firstName, lastName, email, contact,  isChange} = req.body

       
    

    if(!firstName || !lastName || !email || !contact)
        {
            return res.status(400).json({success: false, message: "Please provide all details!"})
        }

         const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: "Please provide a valid email address!" })
        }

         if (firstName.length < 3) {
            return res.status(400).json({ success: false, message: "Please enter atleast 3 characters for First Name!" })
        }

         const contactRegex = /^\d{10}$/;
        if (typeof contact === 'string') {
            if (!contactRegex.test(contact)) {
                return res.status(400).json({ success: false, message: "Invalid contact number! kindly provide valid 10 digit contact." })
            }
        }
        else if (typeof contact === 'number') {
            if (!contactRegex.test(contact.toString())) {
                return res.status(400).json({ success: false, message: "Invalid contact number! kindly provide valid 10 digit contact." })
            }
        }
        else {
            return res.status(400).json({ success: false, message: "Invalid contact!" })
        }

          const fetchUser = await UserModel.findOne({ _id: new mongoose.Types.ObjectId(id) })
            if (!fetchUser) {
                return res.status(401).json({ success: false, message: 'User not found!' })
            }

             // if email is changing, ensure uniqueness
    if (email !== fetchUser.email) {
      const emailTaken = await UserModel.exists({ email });
      if (emailTaken) {
        return res.status(409).json({ success: false, message: "Email already in use." });
      }
    }

       const updateDoc = {
      firstName: initialLetterCaps(firstName),
      email,
      contact: contact,
      ...(lastName && { lastName: initialLetterCaps(lastName) }),
      // role: 'employer'
    };

        if(isChange)
        {
            const {currentPassword, password} = req.body
           
            if (!currentPassword || !password) {
                return res.status(400).send({ success: false, message: "Current Password and New Password is required!" })
            }
           
            const isPasswordMatch = await bcrypt.compare(currentPassword, fetchUser.password)

            if (!isPasswordMatch) {
                return res.status(401).json({ success: false, message: 'Incorrect Password!' })
            }

            const saltRounds = Number(process.env.saltRounds) || 12
            const hashedPassword = await bcrypt.hash(password, saltRounds)

            if (!hashedPassword) {
                return res.status(500).json({ success: false, message: "Failed to process Password! Please contact support Team or try again later." })
            }
 updateDoc.password = hashedPassword;
           
        }
   const updateDatas =await UserModel.updateOne({ _id: id }, { $set: updateDoc });

            if(!updateDatas){
                return res.status(500).json({ success: false, message: "Failed to update Employers Data ! Please contact support Team or try again later." }) 
            }
 return res.status(200).json({
      success: true,
      message: isChange
        ? "Successfully updated employer data and password."
        : "Successfully updated employer data.",
    });
       

    }
    catch(err)
    {
        console.log("Error in updating Employer Data and Password:", err)
        return res.send({ success: false, message: 'Trouble in updating Employer Data and Password! Please contact support Team.' })
    }

})



module.exports = AuthRouter