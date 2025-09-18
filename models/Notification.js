const mongoose = require('mongoose');

const NotificationSchema = mongoose.Schema({
    id: { type: String},
    userId: { type: String },
    title: { type: String },
    description: { type: String},
    type: { type: String, enum: ['job-application', 'application-status', 'assistance-alert', 'system-alert', 'device-status'], lowercase: true, trim: true, default: 'system-alert'},
    isRead: { type: Boolean, default: false}
},
{
    timestamps: true
});

// Auto-generate ticketId: SANTR-0001, SANTR-0002...
NotificationSchema.pre('save', async function (next) {
    if (this.isNew && !this.id) {
        try {
            const all = await mongoose.model('candidate-portal-v1-notification')
                .find({ id: { $regex: /^SANAlert-\d{4}$/ } })
                .select('id'); // ✅ FIXED HERE

            const allIds = all.map(doc => parseInt(doc.id.split('-')[1], 10));
            const maxId = allIds.length > 0 ? Math.max(...allIds) : 0;
            const nextId = maxId + 1;

            this.id = `SANAlert-${String(nextId).padStart(4, '0')}`;
            next();
        } catch (err) {
            next(err);
        }
    } else {
        next();
    }
});

const NotificationModel = mongoose.model('candidate-portal-v1-notification', NotificationSchema);
module.exports = NotificationModel;