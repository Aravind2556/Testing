// models/Comments.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const singleCommentSchema = new Schema(
    {
        message: { type: String, required: true, trim: true, minlength: 2, maxlength: 2000 },
        commentedBy: { type: Schema.Types.ObjectId, ref: 'candidate-portal-v1-users', required: true },
        commentedByName: { type: String, trim: true }, // denormalized for quick display
        commentedOn: { type: Date, default: Date.now }
    },
    { _id: false }
);

const commentSchema = new Schema(
    {
        // Keep an index for fast lookups by candidate
        candidateId: { type: Schema.Types.ObjectId, ref: 'candidate-portal-v1-candidate', required: true },

        // Array of comments (most recent last by default)
        comments: { type: [singleCommentSchema], default: [] }
    },
    {
        timestamps: true
    }
);

// Optional: Only one document per candidate
commentSchema.index({ candidateId: 1 }, { unique: true });

const Comments = mongoose.model('candidate-portal-v1-comments', commentSchema);
module.exports = Comments;
