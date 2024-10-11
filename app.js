const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();


const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB connection
mongoose.connect("mongodb+srv://niloy4physics:Ck8BaEIQCRzgHnZj@cluster0.m3eki.mongodb.net/user?retryWrites=true&w=majority&appName=mymongodb", {
  useNewUrlParser: true, 
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Error connecting to MongoDB:', err));


// Routes
app.use('/api/users', require('./routes/user'));

const PORT = process.env.PORT || 259;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
