require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'your-secret-key', resave: false, saveUninitialized: true })); // Change secret in production!
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/student', require('./routes/student'));

// Root redirect
app.get('/', (req, res) => res.redirect('/auth/login'));

// Start server
app.listen(3000, () => console.log('Server running on http://localhost:3000'));