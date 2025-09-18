const mongoose = require('mongoose');

const RaiseTicketsSchema = mongoose.Schema({
    ticketId: { type: String, unique: true }, // Auto-generated
    userId: { type: String },
    subject: { type: String },
    message: { type: String },
    remark: { type: String },
    status: { type: String, enum: ['raised','resolved'], lowercase: true, trim: true, default: 'raised' }
},
    {
        timestamps: true
    });

// Auto-generate ticketId: SANTR-0001, SANTR-0002...
RaiseTicketsSchema.pre('save', async function (next) {
    if (this.isNew && !this.ticketId) {
        try {
            const all = await mongoose.model('candidate-portal-v1-ticket')
                .find({ ticketId: { $regex: /^SANTR-\d{4}$/ } })
                .select('ticketId');

            const allIds = all.map(doc => parseInt(doc.ticketId.split('-')[1], 10));
            const maxId = allIds.length > 0 ? Math.max(...allIds) : 0;
            const nextId = maxId + 1;

            this.ticketId = `SANTR-${String(nextId).padStart(4, '0')}`;
            next();
        } catch (err) {
            next(err);
        }
    } else {
        next();
    }
});

const TicketsModel = mongoose.model('candidate-portal-v1-ticket', RaiseTicketsSchema);
module.exports = TicketsModel;