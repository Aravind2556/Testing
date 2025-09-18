const UserModel = require('../models/User')

const isAuth = async (req, res, next) => {
    try{
        if(!req.session.user){
            return res.send({success: false, message: 'Please login to access this page!'})
        }

        const fetchUser = await UserModel.findOne({email: req.session.user.email.toLowerCase()})
        if(!fetchUser){
            return res.send({success: false, message: 'User not found!'})
        }

        next()
    }
    catch(err){
        console.log("Error in isAuth:",err)
        return res.send({success: false, message: 'Trouble in checking Authentication! Please contact support Team.'})
    }
}

module.exports = isAuth;