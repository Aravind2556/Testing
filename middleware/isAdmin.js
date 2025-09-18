const UserModel = require('../models/User')

const isEmployer = async (req, res, next) => {
    try{
        if(!req.session.user){
            return res.send({success: false, message: 'Please login to access this page!'})
        }

        const fetchUser = await UserModel.findOne({email: req.session.user.email.toLowerCase()})
        if(!fetchUser){
            return res.status(401).json({success: false, message: 'User not found!'})
        }

        if(fetchUser.role === "admin"){
            next()
        }
        else{
            return res.status(403).json({success: false, message: `You don't have permission to perform this action!`})
        }
        
    }
    catch(err){
        console.log("Error in isAuth:",err)
        return res.send({success: false, message: 'Trouble in checking Authentication! Please contact support Team.'})
    }
}

module.exports = isEmployer;