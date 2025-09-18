const mongoose = require('mongoose');

const SessionLogsSchema = new mongoose.Schema({
    sessionId: { type: String }, // auto-generated
    userId: { type: String, required: true },
    browserName: { type: String, required: true },
    ipAddress: { type: String, required: true },
    status: { type: String, required: true, enum: ['in', 'out','expired'], trim: true, lowercase: true, default: 'in', index: true }
}, {
    timestamps: true
});


// Auto-generate sessionId: SANLogs-0001, SANLogs-0002...
SessionLogsSchema.pre('save', async function (next) {
    if (this.isNew && !this.sessionId) {
        try {
            const all = await mongoose.model('session-logs')
                .find({ sessionId: { $regex: /^SANLogs-\d{4}$/ } })
                .select('sessionId'); // ✅ FIXED HERE

            const allIds = all.map(doc => parseInt(doc.sessionId.split('-')[1], 10));
            const maxId = allIds.length > 0 ? Math.max(...allIds) : 0;
            const nextId = maxId + 1;

            this.sessionId = `SANLogs-${String(nextId).padStart(4, '0')}`; 
            next();
        } catch (err) {
            next(err);
        }sessionId
    } else {
        next();
    }
});

const SessionLogsModel = mongoose.model('session-logs', SessionLogsSchema);
module.exports = SessionLogsModel;
