const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Subject = require('../models/Subject');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

const otpGenerator = require('otp-generator');
const OTPStore = {};
require('dotenv').config();

const multer = require('multer');
const path = require('path');
const AWS = require('aws-sdk');
const fs = require('fs');
// Set up AWS credentials
AWS.config.update({
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_ACCESS_KEY,
    region: AWS_REGION
});

AWS_BUCKET_NAME=AWS_BUCKET_NAME

console.log(AWS_ACCESS_KEY_ID, AWS_ACCESS_KEY, AWS_REGION, EMAIL_PASS, EMAIL_USER);

const s3 = new AWS.S3();

// Multer setup for file uploads
const storage = multer.memoryStorage(); // Store in memory for immediate S3 upload
const upload = multer({ storage });


const SECRET_KEY = "123456"; 
// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER, 
    pass: EMAIL_PASS 
  }
});

// Generate OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

router.post('/contact-form', (req, res) => {
  const { name, email, class: studentClass, message } = req.body;
  try {
    const mailOptions = {
      from: email, // User's email
      to: EMAIL_USER, // Admin's email
      subject: `New Message from ${name}`,
      text: `Class: ${studentClass}\nMessage: ${message}\nFrom: ${email}`
    };
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return res.status(500).json({ msg: 'Error sending email' });
      } else {
        return res.status(200).json({ msg: 'Message sent successfully' });
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});


// Register Route
router.post('/signup', async (req, res) => {
  const { email } = req.body;
  
  try {
    // Check if the user already exists and has completed registration (not just email and otp)
    let user = await User.findOne({ email });
    
    // If user exists and has other details, then the user is fully registered
    if (user && user.userName && user.phone && user.password) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

    // If user exists with just email and otp, update the OTP
    if (user && !user.userName) {
      user.otp = otp;
      await user.save();
    } else {
      // Generate a unique userId for new users
      const userId = uuidv4();  // Use uuid to generate a unique userId

      // Create new user with just email, userId, and OTP
      user = new User({
        userId,   // Save the generated userId
        email,
        otp,
        loggedInStatus: false
      });
      await user.save();
    }

    // Send OTP to email using Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      }
    });

    const mailOptions = {
      from: EMAIL_USER,
      to: email,
      subject: 'OTP Verification',
      text: `Your OTP is ${otp}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return res.status(500).json({ msg: 'Error sending OTP' });
      } else {
        res.status(200).json({ msg: 'OTP sent successfully', email });
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, otp, userName, password, schoolName, class: userClass, enrollmentDate, subjects } = req.body;

  try {
    // Find user by email
    let user = await User.findOne({ email });

    if (!user || !user.otp) {
      return res.status(400).json({ msg: 'OTP has not been sent. Please sign up first.' });
    }

    // Check if OTP matches
    if (user.otp !== otp) {
      return res.status(400).json({ msg: 'Invalid OTP' });
    }

    
    if(email===EMAIL_USER){
      userType='admin';
    }
    else{
      userType='student';
    }


    // Update user details after successful OTP verification
    user.userName = userName;
    user.password = bcrypt.hashSync(password, 10); // Hash password
    user.otp = undefined;  // Remove OTP after verification
    user.userType = userType;

    // Optionally update other fields if they exist in the request
    if (schoolName) user.schoolName = schoolName;
    if (userClass) user.class = userClass;
    if (enrollmentDate) user.enrollmentDate = enrollmentDate;

    // Ensure subjects is an array and assign to user.subjects
    if (subjects && Array.isArray(subjects)) {
      user.subjects = subjects;
    }

    await user.save();

    res.status(200).json({ msg: 'User registered successfully', isAdmin: email === EMAIL_USER });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});


// Login Route - Step 1: Verify Email, Password, and Send OTP
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user by email
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'User not found' });
    }

    // Check if user is already logged in another device
    if (user.loggedInStatus) {
      return res.status(403).json({ msg: 'User already logged in on another device. Please log out from that device first.' });
    }

    // Compare the entered password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // OTP handling and JWT generation
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP
    user.otp = otp;
    await user.save();

    // Send OTP to email using Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: EMAIL_USER,
      to: email,
      subject: 'Login OTP Verification',
      text: `Your OTP is ${otp}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return res.status(500).json({ msg: 'Error sending OTP' });
      } else {
        res.status(200).json({ msg: 'OTP sent successfully', userId: user._id });
      }
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// OTP Verification Route - Step 2: Verify OTP and Log the User In
router.post('/verify-login-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Find the user by email
    let user = await User.findOne({ email });

    if (!user || !user.otp) {
      return res.status(400).json({ msg: 'OTP has not been sent. Please try logging in again.' });
    }

    // Check if OTP matches
    if (user.otp !== otp) {
      return res.status(400).json({ msg: 'Invalid OTP' });
    }

    // OTP is verified, generate JWT and log the user in
    const token = jwt.sign({ userId: user.userId }, 'niloy4physicsml', { expiresIn: '168h' });

    // Update loggedInStatus to true after successful login
    user.loggedInStatus = true;
    user.otp = undefined;  // Clear OTP after verification
    await user.save();

    res.status(200).json({
      msg: 'Login successful',
      token,
      isAdmin: email === EMAIL_USER,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});


// Logout Route
router.post('/logout', async (req, res) => {
  const { email } = req.body;

  try {

    // Find the user by email
    let user = await User.findOne({ email });
    
    if (!user) {
      return res.status(400).json({ msg: 'User not found' });
    }

    // Update loggedInStatus to false
    user.loggedInStatus = false;
    await user.save();

    res.status(200).json({ msg: 'Logout successful' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Forgot Password Route - Step 1: Generate OTP and send to email
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    // Find user by email
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'User not found' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP
    user.otp = otp;
    await user.save();

    // Send OTP to email using Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      }
    });

    const mailOptions = {
      from: EMAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is ${otp}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return res.status(500).json({ msg: 'Error sending OTP' });
      } else {
        res.status(200).json({ msg: 'OTP sent successfully', userId: user._id });
      }
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// OTP Verification Route - Step 2: Verify OTP and allow password reset
router.post('/verify-forgotp-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user || user.otp !== otp) {
      return res.status(400).json({ msg: 'Invalid OTP' });
    }

    // OTP is valid, allow password reset
    res.status(200).json({ msg: 'OTP verified successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Password Reset Route - Step 3: Reset Password
router.post('/reset-password', async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'User not found' });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.otp = undefined; // Clear OTP after password reset
    await user.save();

    res.status(200).json({ msg: 'Password changed successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Find the user by email
router.post('/getUserName', async (req, res) => {
  const { email } = req.body; 
    try {
        // Fetch user by email, selecting only the userName field
        const user = await User.findOne({ email: email }, 'userName');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        return res.status(200).json({ name: user.userName });
    } catch (error) {
        console.error('Error fetching user by email:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/verifySecretKey', (req, res) => {
  const { secretKey } = req.body;

  // Verify if the secret key matches
  if (secretKey !== SECRET_KEY) {
    return res.status(400).json({ success: false, message: 'Invalid Secret Key' });
  }

  // Generate OTP
  const otp = otpGenerator.generate(6, { digits: true });
  
  // Store OTP temporarily, you should store it in DB for production use
  OTPStore.adminOtp = otp;

  // Send OTP to Admin's Email (setup email properly)
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });

  const mailOptions = {
    from: EMAIL_USER,
    to: EMAIL_USER,  // Replace with actual admin email
    subject: 'Your Admin OTP',
    text: `Your OTP is: ${otp}`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error sending OTP' });
    }
    res.status(200).json({ success: true, message: 'OTP sent to email' });
  });
});

router.post('/verifyAdminOtp', (req, res) => {
  const { otp } = req.body;

  // Check if OTP matches the stored one
  if (otp !== OTPStore.adminOtp) {
    return res.status(400).json({ success: false, message: 'Invalid OTP' });
  }

  // Clear the OTP after successful verification
  OTPStore.adminOtp = null;

  res.status(200).json({ success: true, message: 'OTP verified' });
});

//Add Subject Route
router.post('/add-subject', async (req, res) => {
  const { subjectId, subjectName, subjectClass } = req.body;
  try {
    // Check if the subject already exists by subjectId or subjectName
    let subject = await Subject.findOne({subjectId});
    if (subject) {
      return res.status(400).json({ msg: 'Subject already exists' });
    }
    // Create new subject
    subject = new Subject({
      subjectId,
      subjectName,
      subjectClass
    });
    // Save the subject to the database
    await subject.save();
    res.status(201).json({ msg: 'Subject added successfully!' });

  } catch (err) {
    res.status(500).send('Server error');
  }
});

router.post('/user-type', async (req, res) => {
  const { email } = req.body;
  try {
    let user = await User.findOne({email});
    if (user.userType === 'admin') {
      return res.status(200).json({ userType: 'admin' });
    }
    else if (user.userType === 'student') {
      return res.status(200).json({ userType: 'student' });
    }
  } catch (err) {
    res.status(500).send('Server error');
  }
});

//Request Access Of Course
router.post('/request-subject-access', async (req, res) => {
  const { email, schoolName, presentClass, sessionDate, subjectId } = req.body;
  try {
    // Find the subject by subjectId
    let subject = await Subject.findOne({ subjectId });
    if (!subject) {
      return res.status(404).json({ msg: 'Subject Not Found' });
    }
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: 'User Not Found' });
    }
    // Update user details
    user.schoolName = schoolName;
    user.class = presentClass;
    user.enrollmentDate = sessionDate;

    await user.save();

    // Add the email to the 'temporary' array if it's not already in the array
    if (!subject.temporary.some(u => u.email === email)) {
      subject.temporary.push({ email });
      await subject.save();
    } else {
      return res.status(400).json({ msg: 'Access request already made' });
    }

    res.status(200).json({ msg: 'Access request successful' });
  } catch (err) {
    res.status(500).json('Server error');
  }
});

// Check if access is granted
router.post('/enrollment-status', async (req, res) => {
  const { email, subjectId } = req.body;
  try {
    let subject = await Subject.findOne({ subjectId });
    if (!subject) {
      return res.status(404).json(0); // Subject not found
    }
    
    // Check if the email exists in the 'temporary' array
    const isInTemporary = subject.temporary.some(user => user.email === email);
    
    // Check if the email exists in the 'permanent' array
    const isInPermanent = subject.permanent.some(user => user.email === email);

    if (isInPermanent) {
      return res.status(200).json(2); // Email is in 'permanent', user can view the course
    } else if (isInTemporary) {
      return res.status(200).json(1); // Email is in 'temporary', access requested
    } else {
      return res.status(200).json(0); // Email not in either, user can enroll
    }
  } catch (err) {
    console.error(err);
    res.status(500).json('Server error');
  }
});


// Grant access to course
router.post('/approve-request', async (req, res) => {
  const { email, subjectId } = req.body;

  try {
    // Find the subject using the subjectId
    let subject = await Subject.findOne({ subjectId });
    
    if (!subject) {
      return res.status(404).json({ msg: 'Subject not found' });
    }

    // Check if the student email exists in the temporary array
    const studentIndex = subject.temporary.findIndex(student => student.email === email);
    
    if (studentIndex === -1) {
      return res.status(404).json({ msg: 'Student not found in temporary requests' });
    }

    // Move the student from 'temporary' to 'permanent' array
    const student = subject.temporary.splice(studentIndex, 1)[0];
    subject.permanent.push(student);

    // Save the updated subject document
    await subject.save();

    // Find the user by email and add the subjectId to their subjects array
    let user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Check if the subjectId is already present in the user's subjects array
    const isSubjectAdded = user.subjects.find(sub => sub.subjectId === subjectId);
    
    if (!isSubjectAdded) {
      user.subjects.push({ subjectId });
      await user.save(); // Save the updated user document
    }

    res.status(200).json({ msg: 'Access granted and subject added to user profile successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json('Server error');
  }
});



//Revoke access to course
router.post('/decline-request', async (req, res) => {
  const { email, subjectId } = req.body;

  try {
    // Find the subject with the email in the temporary array
    let subject = await Subject.findOne({ subjectId });
    
    if (!subject) {
      return res.status(404).json({ msg: 'Request not found' });
    }

    // Remove the student from the temporary array
    subject.temporary = subject.temporary.filter(student => student.email !== email);

    await subject.save();

    res.status(200).json({ msg: 'Access request declined' });
  } catch (err) {
    console.error(err);
    res.status(500).json('Server error');
  }
});


router.get('/pending-requests', async (req, res) => {
  try {
    // Fetch all subjects with pending access requests
    let subjects = await Subject.find({ 'temporary.0': { $exists: true } }); // Finds subjects with at least one temporary entry
    
    let students = [];

    for (const subject of subjects) {
      for (const tempUser of subject.temporary) {
        // Find the user details from the User collection based on the email
        let user = await User.findOne({ email: tempUser.email });

        if (user) {
          students.push({
            subjectId: subject.subjectId,
            subjectName: subject.subjectName,
            studentClass: user.class, // Assuming `class` is the student's current class
            studentName: user.userName, // Student name from the User model
            schoolName: user.schoolName,
            enrollmentDate: user.enrollmentDate,
            email: tempUser.email // Temporary email for the student
          });
        }
      }
    }

    res.status(200).json({ students });
  } catch (err) {
    console.error(err);
    res.status(500).json('Server error');
  }
});

router.get('/enrolled-students', async (req, res) => {
  try {
    // Fetch all subjects with pending access requests
    let subjects = await Subject.find({ 'permanent.0': { $exists: true } }); // Finds subjects with at least one temporary entry
    
    let enrolledStudents = [];

    for (const subject of subjects) {
      for (const tempUser of subject.permanent) {
        // Find the user details from the User collection based on the email
        let user = await User.findOne({ email: tempUser.email });

        if (user) {
          enrolledStudents.push({
            subjectId: subject.subjectId,
            subjectName: subject.subjectName,
            studentClass: user.class, // Assuming `class` is the student's current class
            studentName: user.userName, // Student name from the User model
            schoolName: user.schoolName,
            enrollmentDate: user.enrollmentDate,
            email: tempUser.email // Temporary email for the student
          });
        }
      }
    }

    res.status(200).json({ enrolledStudents });
  } catch (err) {
    console.error(err);
    res.status(500).json('Server error');
  }
});

//Remove access to course
router.post('/remove-student', async (req, res) => {
  const { email, subjectId } = req.body;
  try {
    // Find the subject with the email in the permanent array
    let subject = await Subject.findOne({ 'permanent.email': email });
    if (!subject) {
      return res.status(404).json({ msg: 'Request not found' });
    }
    // Remove the student from the permanent array
    subject.permanent = subject.permanent.filter(student => student.email !== email);
    // Save the updated subject document
    await subject.save();
    // Find the user by email and remove the subjectId from their subjects array
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    // Remove the subjectId from the user's subjects array
    user.subjects = user.subjects.filter(sub => sub.subjectId !== subjectId);
    // Save the updated user document
    await user.save();
    res.status(200).json({ msg: 'Access request declined and subject removed from user profile' });
  } catch (err) {
    console.error(err);
    res.status(500).json('Server error');
  }
});




// Route to upload content
router.post('/:id/uploadContent', upload.array('files', 10), async (req, res) => {
  const { title, content, videoUrl, day } = req.body;
  const files = req.files;

  if (!title || !day) {
    return res.status(400).send({ error: 'Title and Day are required' });
  }

  const uploadedFiles = {
    images: [],
    documents: []
  };

  try {
    // Upload files to S3 and store file names only
    for (const file of files) {
      const fileKey = `${Date.now()}_${file.originalname}`;
      const params = {
        Bucket: AWS_BUCKET_NAME,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype
      };

      const url= await s3.upload(params).promise();
      
      const s3Name = url.Location.split('/')[3];
      if(s3Name.includes('pdf')){
        uploadedFiles.documents.push(s3Name);
      }else{
        uploadedFiles.images.push(s3Name);
      }
    }
    // Construct the new content structure with file names and extensions only
    const newContent = {
      day,
      title,
      content: content || '',
      videos: videoUrl ? [videoUrl] : [],
      images: uploadedFiles.images,
      documents: uploadedFiles.documents
    };

    const subjectId = req.params.id;

    // Find the subject by its ID and push new content
    let subject = await Subject.findOne({ subjectId });

    if (subject) {
      subject.subjectContents.push(newContent);
      await subject.save();
      res.status(200).send(subject);
    } else {
      res.status(404).send({ error: 'Subject not found' });
    }

  } catch (error) {
    res.status(500).send({ error: 'Failed to upload files or save subject content' });
  }
});


//To fetch contents of a subject 
router.get('/subject-contents/:subjectId', async (req, res) => {
  const subjectId = req.params.subjectId;
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const subject = await Subject.findOne({ subjectId });

    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Reverse the subject contents so the latest are first
    const reversedContents = subject.subjectContents.reverse();

    // Get the total count of subject contents
    const totalItems = reversedContents.length;

    // Slice the reversed contents
    const contents = reversedContents.slice(offset, offset + limit);

    const hasMore = offset + limit < totalItems;

    res.json({
      contents,
      totalItems,
      hasMore,
    });
  } catch (error) {
    console.error('Error fetching subject contents:', error);
    res.status(500).json({ error: 'Failed to load subject contents' });
  }
});



// Get presigned URL for image using request body
router.get('/get-signedUrl', async (req, res) => {
  const fileKey = decodeURIComponent(req.query.key); // Decode URL if needed

  if (!fileKey) {
    return res.status(400).send({ error: 'File key is required' });
  }

  const params = {
    Bucket: AWS_BUCKET_NAME,
    Key: fileKey,
    Expires: 60 * 5 // URL expires in 5 minutes
  };

  try {
    const url = await s3.getSignedUrlPromise('getObject', params);
    res.status(200).json({ url }); // Send the URL in the response as JSON
  } catch (error) {
    console.error('Failed to get signed URL:', error);
    res.status(500).send({ error: 'Failed to get the signed URL' });
  }
});

router.get('/get-pdf', async (req, res) => {
  const params = {
    Bucket: AWS_BUCKET_NAME,
    Key: decodeURIComponent(req.query.key),
  };

  try {
    const fileStream = s3.getObject(params).createReadStream();  // Stream the PDF file
    res.setHeader('Content-Type', 'application/pdf');
    fileStream.pipe(res);  // Stream the PDF directly to the response
  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).send({ error: 'Error fetching the PDF file' });
  }
});

router.post('/remove-content', async (req, res) => {
  const { subjectId, day } = req.body; // Expecting subjectId and day from the request body
  try {
    // Find the subject by subjectId
    let subject = await Subject.findOne({ subjectId });
    if (!subject) {
      return res.status(404).json({ msg: 'Subject not found' });
    }
    // Check if the content with the provided day exists
    const contentExists = subject.subjectContents.some(content => content.day === day);
    if (!contentExists) {
      return res.status(404).json({ msg: 'Content for the specified day not found' });
    }
    // Remove the content for the specified day
    subject.subjectContents = subject.subjectContents.filter(content => content.day !== day);
    await subject.save(); // Save the updated subject
    res.status(200).json({ msg: 'Content removed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


module.exports = router;
