const mongoose = require('mongoose')
const SessionLogs = require('../../models/SessionLogs')

const SessionCollection = mongoose.connection.collection("sessions");
const SessionExpire = async () => {
    const sessionsCursor = SessionCollection.find({});
    const sessions = await sessionsCursor.toArray(); 
    sessions.forEach(async (ses) => {
        try{
            let sessionData = ses.session
            console.log("sessionData",sessionData)
            if(sessionData){
                const logs = await SessionLogs.find({})
                
                
                
            }
            else{
                console.log("All session expiry")
            }
            
           
        }
         catch (err) {
        console.error("❌ Parse error:", err);
        }
    })

}


module.exports = SessionExpire