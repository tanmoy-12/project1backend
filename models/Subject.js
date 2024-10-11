const mongoose = require('mongoose');

const SubjectSchema = new mongoose.Schema({
  subjectId: { type: String, unique: true, required: true },
  subjectName: { type: String, required: true },
  subjectClass: { type: String, required: true },
  temporary: [{ email: { type: String } }],
  permanent: [{ email: { type: String } }],
  subjectContents: [{
    day: { type: String, required: true }, // Day-wise structure
    title: { type: String, required: true },
      content: { type: String },
      images: [{ type: String }],     // URLs of images from S3
      videos: [{ type: String }],     // URLs of videos
      documents: [{ type: String }]   // URLs of documents
  }]
});

module.exports = mongoose.model('Subject', SubjectSchema);

