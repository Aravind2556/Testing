const Express = require('express')
const isAuth = require('../middleware/isAuth')
const NotificationModel = require('../models/Notification')

const NotificationRouter = Express.Router()

NotificationRouter.get('/fetch-notification', isAuth, async (req, res) => {
    try {
        const user = req?.session?.user;
        const userId = user?.id;
        const role = user?.role;
        if (!user || !role || !userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const filter = { userId };
        if (!['admin', 'employer', 'job-seeker'].includes(role)) {
            return res.status(403).json({ success: false, message: "Access denied for this role" });
        }
        const notificationData = await NotificationModel.find(filter);
        if (!notificationData || notificationData.length === 0) {
            return res.status(200).json({success: true, message: "No notifications found",notifications: [] });
        }
        let notificationsSorted = notificationData.sort((a, b) => {
            if (a.isRead !== b.isRead) {
                return a.isRead - b.isRead;
            }
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        if (!notificationsSorted || notificationsSorted.length === 0) {
            return res.status(200).json({ success: false, message: "No notifications found", notifications: [] });
        }       
        return res.status(200).json({ success: true, message: "Fetched notifications successfully", notifications: notificationsSorted });
    } catch (err) {
        console.log('Error fetching notifications:', err);
        return res.status(500).json({success: false,message: "Internal server error", error: err.message});
    }
});

NotificationRouter.put('/ticket-read-status', isAuth , async (req,res)=> {
    try{
        const { id } = req.body
        const user = req?.session?.user
        if (!id || !['admin','employer', 'job-seeker'].includes(user?.role)) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const updatedTicket = await NotificationModel.updateOne({ _id: id }, { $set :{isRead: true}});
        if (updatedTicket) {
            return res.status(200).json({ success: true, message: "Ticket marked as read." });
        }
        else {
            return res.status(500).json({ success: false, message: "Failed to update ticket read" });
        }        
    }
    catch(err){
        console.log('Error read notifications:', err);
        return res.status(500).json({ success: false, message: "Internal server error", error: err.message });
    }
})

NotificationRouter.put('/ticket-read-status-all', isAuth, async (req, res) => {
    try {
        const { id } = req.body
        const userIdString = String(id);
        const user = req?.session?.user
        if (!id || !userIdString || !['admin', 'employer', 'job-seeker'].includes(user?.role)) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const updatedTicket = await NotificationModel.updateMany({ userId: userIdString },{ $set: { isRead: true } });
        if (updatedTicket) {
            return res.status(200).json({ success: true, message: "Ticket marked as read." });
        }
        else {
            return res.status(500).json({ success: false, message: "Failed to update ticket read" });
        }
    }
    catch (err) {
        console.log('Error read notifications:', err);
        return res.status(500).json({ success: false, message: "Internal server error", error: err.message });
    }
})


module.exports = NotificationRouter