const express = require("express");
const SessionLogsModel = require("../models/SessionLogs");
const UserModel = require("../models/User");
const isAuth = require("../middleware/isAdmin");

const SessionLogsRouter = express.Router();


// SessionLogsRouter.get("/fetch-session-logs", isAuth, async (req, res) => {
//     try {
//         const user = req.session.user;
//         if (!user || user.role !== "admin") {
//             return res.status(403).json({ success: false, message: "Unauthorized access" });
//         }
//         const fetchLogs = await SessionLogsModel.find({});
//         if (!fetchLogs || fetchLogs.length === 0) {
//             return res.status(200).json({ success: true,message: "No session logs found",sessionLogs: [], });
//         }     
//         const userData = await UserModel.find({id: { $in: fetchLogs.map((log) => log.userId) }});
//         const result = userData.map((usr) => {
//             const userLogs = fetchLogs.filter((log) => log.userId === usr.id);
//             const lastIn = userLogs
//                 .filter((log) => log.status === "in")
//                 .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
//             const lastOut = userLogs
//                 .filter((log) => log.status === "out")
//                 .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
//             const lastLog = userLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
//             return {
//                 id: usr.id,
//                 firstName: usr.firstName,
//                 lastName: usr.lastName,
//                 email: usr.email,
//                 contact: usr.contact,
//                 role: usr.role,
//                 lastLogin: lastIn ? lastIn.createdAt : null,
//                 lastLogout: lastOut ? lastOut.createdAt : null,
//                 lastStatus: lastLog ? lastLog.status : null, 
//                   // 👈 status of latest log
//             };
//         });
//         return res.status(200).json({success: true,message: "Successfully fetched session logs!", sessionLogs: result});
//     } catch (err) {
//         console.error("Error in fetching session logs:", err);
//         return res.status(500).json({ success: false,message: "Internal server error",error: err.message});
//     }
// });


// fetch particular user session logs datas
SessionLogsRouter.post("/fetch-Logs-History/:userId",isAuth , async (req,res)=>{
    try{
        const {userId} = req.params

        if(!userId)
        {
            return res.status(400).json({uccess: false, message : "UserId is missing"})
        }

         const {pages, sessionLogsPerPage} = req.body
console.log(pages, sessionLogsPerPage)

  if (!pages || !sessionLogsPerPage) {
            return res.status(400).json({ success: false, message: "Page or items-per-page is missing." });
        }

        const limit = parseInt(sessionLogsPerPage, 10);
       
       
        const fetchLogs = await SessionLogsModel.aggregate([
  { $match: { userId: userId } },
  {
    $facet: {
      // First pipeline → actual paginated data
      data: [
        { $sort: { createdAt: -1 } },
        { $skip:  (pages - 1) * limit },
        { $limit: limit}
      ],
      
      // Second pipeline → count of all logs
      totalCount: [
        { $count: "count" }
      ]
    }
  }
])


const totalLogs = fetchLogs[0].totalCount[0]?.count || 0;
const totalPages = Math.ceil(totalLogs / limit);


const fetchUser = await UserModel.findOne({id: userId})

if(!fetchUser)
{
    return res.status(200).json({success: false, message:"No User Found with this UserID"})
}

const fetchUserwithlogs = fetchLogs.map(log => ({
    ...log,
    _id: fetchUser._id,
    firstName: fetchUser.firstName,  
     lastName: fetchUser.lastName,  
      email: fetchUser.email,  
      contact: fetchUser.contact ,
      role: fetchUser.role
}))

        if(fetchLogs && fetchLogs.length > 0 && fetchUser) {
            return res.status(200).json({ success: true, message: "Successfully fetched session logs!", logHistory :fetchUserwithlogs, totalPages:totalPages,
                totalLogs : totalLogs
             });
        }
        else{
            return res.send({success : false , message : "Failed to fetch session Log please try gain later"})
        }
    } catch (err) {
        console.error("Error in fetching session logs:", err);
        return res.status(500).json({ success: false, message: "Internal server error", error: err.message });
    }
})


// 🔹 Fetch Session Logs all user datas (Admins Only)
SessionLogsRouter.post("/fetch-session-logs", isAuth, async (req, res) => {
    try {
        const {pages, sessionLogsPerPage} = req.body
console.log(pages, sessionLogsPerPage)


        // const user = req.session.user;
        // if (!user || user.role !== "admin") {
        //     return res.status(403).json({ success: false, message: "Unauthorized access" });
        // }

          if (!pages || !sessionLogsPerPage) {
            return res.status(400).json({ success: false, message: "Page or items-per-page is missing." });
        }

        const limit = parseInt(sessionLogsPerPage, 10);
       


       
       const totalUsers = await SessionLogsModel.distinct("userId");
const totalUserCount = totalUsers.length;
         const totalPages = Math.ceil(totalUserCount / limit);

        const fetchLogs = await SessionLogsModel.aggregate([
  // 1. Filter (like find)
  

  // 2. Sort latest (descending by createdAt or _id)
  {
    $sort: { createdAt: -1 } // or _id: -1
  },

  // 3. Skip (for pagination)
  {
    $skip: (pages - 1) * limit// calculate in backend
  },

  // 4. Limit (for pagination)
  {
    $limit: limit
  }
])
        if (!fetchLogs || fetchLogs.length === 0) {
            return res.status(200).json({ success: true,message: "No session logs found",sessionLogs: [], });
        }     
        const userData = await UserModel.find({id: { $in: fetchLogs.map((log) => log.userId) }});
        const result = userData.map((usr) => {
            const userLogs = fetchLogs.filter((log) => log.userId === usr.id);
            const lastIn = userLogs
                .filter((log) => log.status === "in")
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
            const lastOut = userLogs
                .filter((log) => log.status === "out")
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
            const lastLog = userLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
            return {
                _id: usr._id,
                id: usr.id,
                firstName: usr.firstName,
                lastName: usr.lastName,
                email: usr.email,
                contact: usr.contact,
                role: usr.role,
                lastLogin: lastIn ? lastIn.createdAt : null,
                lastLogout: lastOut ? lastOut.createdAt : null,
                lastStatus: lastLog ? lastLog.status : null, 
                  // 👈 status of latest log
            };
        });
        return res.status(200).json({success: true,message: "Successfully fetched session logs!", sessionLogs: result,totalPages : totalPages, totalLogs : totalUserCount});
    } catch (err) {
        console.error("Error in fetching session logs:", err);
        return res.status(500).json({ success: false,message: "Internal server error",error: err.message});
    }
});






// SessionLogsRouter.get("/fetch-Logs-History/:userId", isAuth, async (req, res) => {
//     try {
//         const { userId } = req.params;
//         const user = req.session.user;

//         if (!userId || !user || user.role !== "admin") {
//             return res.status(403).json({ success: false, message: "Unauthorized access" });
//         }

//         // fetch logs latest first
//         const logs = await SessionLogsModel.find({ userId }).sort({ createdAt: -1 });

//         if (!logs || logs.length === 0) {
//             return res.status(200).json({ success: true, message: "No logs found", logHistory: {} });
//         }

//         // week & month boundaries
//         const now = new Date();
//         const startOfWeek = new Date(now);
//         startOfWeek.setDate(now.getDate() - now.getDay());
//         startOfWeek.setHours(0, 0, 0, 0);

//         const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

//         // group logs per day
//         const groupedLogs = {};
//         logs.forEach(log => {
//             const dateKey = new Date(log.createdAt).toISOString().split("T")[0]; // yyyy-mm-dd
//             if (!groupedLogs[dateKey]) groupedLogs[dateKey] = [];
//             groupedLogs[dateKey].push(log);
//         });

//         const finalHistory = {};
//         let weeklyTotal = 0;
//         let monthlyTotal = 0;

//         Object.keys(groupedLogs).forEach(dateKey => {
//             const dayLogs = groupedLogs[dateKey].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
//             let sessions = [];
//             let totalHours = 0;

//             for (let i = 0; i < dayLogs.length; i++) {
//                 if (dayLogs[i].status === "in" && dayLogs[i + 1] && dayLogs[i + 1].status === "out") {
//                     const inTime = new Date(dayLogs[i].createdAt);
//                     const outTime = new Date(dayLogs[i + 1].createdAt);

//                     const hoursWorked = (outTime - inTime) / (1000 * 60 * 60); // in hours

//                     sessions.push({
//                         in: inTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
//                         out: outTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
//                         hoursWorked: hoursWorked.toFixed(2)
//                     });

//                     totalHours += hoursWorked;
//                 }
//             }

//             const dateObj = new Date(dateKey);

//             // Add per-day result
//             finalHistory[dateKey] = {
//                 sessions,
//                 totalHours: totalHours.toFixed(2)
//             };

//             // weekly & monthly calc
//             if (dateObj >= startOfWeek) weeklyTotal += totalHours;
//             if (dateObj >= startOfMonth) monthlyTotal += totalHours;
//         });

//         return res.status(200).json({
//             success: true,
//             message: "Successfully fetched session logs!",
//             logHistory: finalHistory,
//             weeklyTotal: weeklyTotal.toFixed(2),
//             monthlyTotal: monthlyTotal.toFixed(2)
//         });

//     } catch (err) {
//         console.error("Error in fetching session logs:", err);
//         return res.status(500).json({ success: false, message: "Internal server error", error: err.message });
//     }
// });




SessionLogsRouter.post("/session-history", isAuth, async (req, res) => {
    try {
        const { currentPage, itemsPerPage } = req.body;

        if (!currentPage || !itemsPerPage) {
            return res.status(400).json({
                success: false,
                message:
                    "Page and items data are not found! please contact support team.",
            });
        }

        const skip = (currentPage - 1) * itemsPerPage;

        const fetchedLogs = await SessionLogsModel.aggregate([
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: itemsPerPage },
            {
                $lookup: {
                    from: "candidate-portal-v1-users", // ✅ must match user collection name
                    localField: "userId",
                    foreignField: "id", // ✅ matching field (not _id, since you store userId as string)
                    as: "userDetails",
                },
            },
            { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    sessionId: 1,
                    userId: 1,
                    browserName: 1,
                    status: 1,
                    ipAddress: 1,
                    createdAt: 1,
                    "userDetails.firstName": 1,
                    "userDetails.lastName": 1,
                    "userDetails.email": 1,
                    "userDetails.contact": 1,
                    "userDetails._id": 1
                },
            },
        ]);

        const totalLogs = await SessionLogsModel.countDocuments({});

        return res.status(200).json({
            success: true,
            message: "Successfully fetched Session data!",
            logs: fetchedLogs,
            totalLogs,
        });
    } catch (err) {
        console.log("Error in fetching Session History:", err);
        return res.status(500).json({
            success: false,
            message:
                "Trouble in fetching session history! please contact support team.",
        });
    }
});

module.exports = SessionLogsRouter;
