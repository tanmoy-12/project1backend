const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const UserSchema = new mongoose.Schema({
  userId: { type: String, unique: true, default: uuidv4 },  // Automatically generate unique userId
  userName: { type: String },
  email: { type: String, unique: true, required: true },
  password: { type: String },
  otp: { type: String },
  loggedInStatus: { type: Boolean, default: false },
  schoolName: {type: String},
  class: { type: String},
  userType: { type: String},
  enrollmentDate: { type: Date},
  subjects: [{ subjectId: {type: String}}]
}); 

module.exports = mongoose.model('User', UserSchema);
