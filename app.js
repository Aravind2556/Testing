const Express = require('express');
const cors = require('cors');
const Mongoose = require('mongoose');
const Session = require('express-session');
const path = require('path');
const AuthRouter = require('./routes/AuthRouter');
const UserRouter = require('./routes/UserRouter');
const candidateRouter = require('./routes/CandidateRouter');
const updateCandidateRouter = require('./routes/Profiles/Candidates/UpdateCandidate'); 
const updateEmployerRouter = require('./routes/Profiles/Employers/UpdateEmployer');
const FilterRouter = require('./routes/Filters/FilterRouter');
const JobRouter = require('./routes/JobRouter');
const AdvancedFilterRouter = require('./routes/Filters/AdvancedFilterRouter');
const LocationRouter = require('./routes/LocationRouter')
const ResumeRouter = require('./routes/ResumeRouter')
const ImportRouter = require('./routes/ImportRouter')
const ApplicationRouter = require('./routes/ApplicationRouter')
const EmployerManagementRouter = require('./routes/EmployerManagementRouter')
const AdminManagementRouter = require('./routes/AdminManagementRouter')
const NotificationRouter = require('./routes/NotificationRouter')
const TicketRouter = require('./routes/TicketRouter')
const candidateEntryRouter = require('./routes/Profiles/Candidates/CandidateEntry')
const SessionLogsRouter = require('./routes/SessionLogs')
const ParseRouter = require('./routes/ParseRouter')
const SessionExpire = require('./utils/SessionExpire/Expire')

const summaryRouter = require('./routes/CandidateSummeryDeatils')


const MongoDbSession = require('connect-mongodb-session')(Session);
require('dotenv').config();

const app = Express();
const port = process.env.Port || 4000;
const twelveHours = 1000 * 60 * 60 * 12; 


const corsOption = {
    origin: [`https://careerconnectai.com`, `https://san-portal.vercel.app`, 'http://localhost:3000', 'http://localhost:3001', 'http://192.168.0.31:3000', 'https://dkgsdb5n-3000.inc1.devtunnels.ms', 'https://candidate-portal.vercel.app',"https://whl9fdg2-3000.inc1.devtunnels.ms"],
    credentials: true
}

app.use(cors(corsOption)); 
app.options('*', cors(corsOption)); 

app.use(Express.json({limit: '50mb'}));
app.use(Express.urlencoded({ limit: '50mb', extended: true }));
// app.set("trust proxy", 1)
app.use('/uploads', Express.static('uploads'))

// Serve static files from the public directory
// Serve images from the public/images directory
// app.use("/images", Express.static(path.join(__dirname, "public/images")));


Mongoose.connect(process.env.MongoDBURI,{
    autoIndex: true
})
.then(()=>{
    console.log('MongoDB connected successfully!');
    SessionExpire()
})
.catch((err)=>{
    console.log("Error in connecting to MongoDB:",err);
})

const store = new MongoDbSession({ 
    uri: process.env.MongoDBURI,
    collection: 'sessions',
    expires: twelveHours
})

app.use(Session({
    name: 'ccai.sid',
    secret: process.env.SessionKey, 
    resave: false, 
    saveUninitialized: false,
    store: store,
    // cookie: {
    //     name: "ccai.sid",
    //     secure: true,
    //     httpOnly: false,
    //     sameSite: 'none',
    //     partitioned: true,
    //     maxAge: twelveHours
    // }
}))

app.use(AuthRouter)
app.use(UserRouter)
app.use(candidateRouter)
app.use(updateCandidateRouter)
app.use(updateEmployerRouter)
app.use(FilterRouter)
app.use(JobRouter)
app.use(AdvancedFilterRouter) 
app.use(LocationRouter)
app.use(ResumeRouter)
app.use(ImportRouter)
app.use(ApplicationRouter)
app.use(EmployerManagementRouter)
app.use(AdminManagementRouter)
app.use(NotificationRouter)
app.use(TicketRouter)
app.use(candidateEntryRouter)
app.use(SessionLogsRouter)
app.use(ParseRouter)

app.use(summaryRouter)



app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})
