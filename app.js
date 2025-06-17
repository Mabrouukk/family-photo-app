const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

const storage = multer.diskStorage({
  destination: './public/uploads',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.get('/', (req, res) => res.render('index'));

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO families (username, password) VALUES ($1, $2)', [username, hashed]);
  res.redirect('/login');
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query('SELECT * FROM families WHERE username = $1', [username]);
  if (result.rows.length > 0) {
    const valid = await bcrypt.compare(password, result.rows[0].password);
    if (valid) {
      req.session.familyId = result.rows[0].id;
      return res.redirect('/dashboard');
    }
  }
  res.send('Invalid credentials');
});

app.get('/dashboard', async (req, res) => {
  if (!req.session.familyId) return res.redirect('/login');
  const result = await pool.query('SELECT * FROM photos WHERE family_id = $1', [req.session.familyId]);
  res.render('dashboard', { photos: result.rows });
});

app.post('/upload', upload.single('photo'), async (req, res) => {
  if (!req.session.familyId) return res.redirect('/login');
  const { caption } = req.body;
  await pool.query('INSERT INTO photos (family_id, filename, caption) VALUES ($1, $2, $3)', [
    req.session.familyId,
    req.file.filename,
    caption
  ]);
  res.redirect('/dashboard');
});

app.post('/delete/:id', async (req, res) => {
  if (!req.session.familyId) return res.redirect('/login');
  const { id } = req.params;
  const photo = await pool.query('SELECT * FROM photos WHERE id = $1 AND family_id = $2', [id, req.session.familyId]);
  if (photo.rows.length > 0) {
    const filename = photo.rows[0].filename;
    fs.unlinkSync(path.join(__dirname, 'public', 'uploads', filename));
    await pool.query('DELETE FROM photos WHERE id = $1', [id]);
  }
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

