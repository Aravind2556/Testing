const Express = require('express')
const UserModel = require('../models/User')
const CandidateModel = require('../models/Candidate')
const EmployerModel = require('../models/Employer')

const router = Express.Router()

router.post('/fetch-profile-data', async (req , res) => {
    try{
        const {id} = req.body

        if(!id){
            return res.status(500).json({success: false, message: "User ID is not found! Please contact Support Team."})
        }

        const fetchUser = await UserModel.findOne({_id: id})

        if(!fetchUser) {
            return res.status(204).json({success: false, message: "User ID is not found! Please contact Support Team."})
        }

        if(fetchUser.role === "job-seeker"){
            const fetchCandidate = await CandidateModel.findOne({user: fetchUser._id}).populate({path: 'user', select: '-password -role'}).select('-createdBy -createdDate -ownership -password -source -updatedAt -updatedBy')
            if(fetchCandidate){
                return res.status(200).json({success: true, message: "Succesfully fetched Candidate data!", user: fetchCandidate})
            }
        }
        else if(fetchUser.role === "employer"){
            const fetchEmployer = await EmployerModel.findOne({user: fetchUser._id}).populate("user")
            if(fetchEmployer){
                return res.status(200).json({success: true, message: "Succesfully fetched Employer data!", user: fetchEmployer})
            }
        }
        
        return res.status(200).json({success: true, message: "Succesfully fetched User data!", user: {user: fetchUser}})
    }
    catch(err){
        console.log("Error in fetching user info:",err)
        return res.status(404).json({ success: false, message: 'Trouble in fetching user info! Please contact support Team.' })
    }
})

router.get('/fetch-user/:id', async (req, res) => {
    try{
        const {id} = req.params

        const returnRes = (code, status, message, label, data) => {
            let resData = { success: status, message: message }
            if(label && data){
                resData[label] = data
            }
            return res.status(code).json(resData)
        }

        if(!id){
            returnRes(400, false, "User ID not found!")
        }

        const fetchUser = await UserModel.findOne({_id: id}).select('-password')

        if(!fetchUser) returnRes(400, false, "User not found!")

        returnRes(200, true, "Sucecsfully fetched User data!", "user", fetchUser)
    }
    catch(err){
        console.log("Error in fetching User:",err)
        return res.status(500).json({success: false, message: "Trouble in fetching User! Kindly contact support team or try again later."})
    }
})

module.exports = router