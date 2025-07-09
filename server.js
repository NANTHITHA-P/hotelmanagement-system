const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const path = require('path');
const app = express();
const port = 3000;
const crypto = require('crypto');

const secretKey = crypto.randomBytes(64).toString('base64');
const JWT_SECRET =secretKey;
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500'], 
  credentials: true,
}));


app.use(bodyParser.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Nanthitha@123',
  database: 'hotel_db'
});

db.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL database');
});


app.post('/signup', (req, res) => {
  const { name, email, password ,phone,address} = req.body;

  db.query('SELECT * FROM user WHERE email = ?', [email], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });

    if (results.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    db.query('INSERT INTO user (name, email, password,phone,address) VALUES (?, ?, ?,?,?)', [name, email, password,phone,address], (err, result) => {
      if (err) return res.status(500).json({ message: 'Signup failed' });
      return res.json({ message: 'User registered successfully' });
    });
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM user WHERE email = ?', [email], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });

    if (results.length === 0 || results[0].password !== password) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const user = results[0];
    const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });

    return res.json({ message: 'Login successful', token, user });
  });
});


const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Forbidden: Invalid token' });
    }
    console.log('Decoded token:', decoded); 
    req.userEmail = decoded.email;  
    next();
  });
};

app.get('/profile', verifyToken, (req, res) => {
  const email = req.userEmail;  

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  const sql = 'SELECT name, email, phone, address FROM user WHERE email = ?';
  db.query(sql, [email], (err, results) => {
    if (err) {
      console.error('DB Error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: results[0] });
  });
});

app.post('/update-profile', (req, res) => {
  const { name, email, phone, address } = req.body;

  const query = `UPDATE user SET name = ?, phone = ?, address = ? WHERE email = ?`;
  db.query(query, [name, phone, address, email], (err, result) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: 'Database error' });
    }

    if (result.affectedRows === 0) {
      return res.json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'Profile updated successfully' });
  });
});
app.post('/change-password', (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: "Missing email or password" });
  }

  const sql = "UPDATE user SET password = ? WHERE email = ?";
  db.query(sql, [newPassword, email], (err, result) => {
    if (err) {
      console.error("Error updating password:", err);
      return res.status(500).json({ message: "Database error" });
    }

    return res.json({ message: "Password updated successfully" });
  });
});
app.post('/api/bookings', (req, res) => {
  const {
    customer_name, email, phone, room_type,
    room_number, checkin_date, checkout_date,
    guests, special_requests, total_price
  } = req.body;

  const checkRoomQuery = `
    SELECT status FROM bookings 
    WHERE room_number = ? 
    AND (checkin_date <= ? AND checkout_date >= ? 
      OR checkin_date >= ? AND checkout_date <= ?)
  `;

  db.query(checkRoomQuery,
    [room_number, checkin_date, checkin_date, checkout_date, checkout_date],
    (err, results) => {
      if (err) {
        console.error('Error checking room status:', err);
        return res.status(500).json({ message: 'Error while checking room availability' });
      }

      if (results.length > 0 && results[0].status === 'booked') {
        return res.status(400).json({ message: 'Room is already booked' });
      }

      const query = `
        INSERT INTO bookings 
        (customer_name, email, phone, room_type, room_number, checkin_date, checkout_date, guests, special_requests, total_price) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(query, [
        customer_name, email, phone, room_type,
        room_number, checkin_date, checkout_date,
        guests, special_requests, total_price
      ], (err, result) => {
        if (err) {
          console.error('Error inserting booking:', err);
          return res.status(500).json({ message: 'Error while booking. Please try again later.' });
        }

        const updateRoomQuery = `
          UPDATE rooms SET status = 'booked'
          WHERE room_number = ? AND status = 'available'
        `;

        db.query(updateRoomQuery, [room_number], (err, result) => {
          if (err) {
            console.log('Error updating room status:', err);
            return res.status(500).json({ message: 'Error while booking. Please try again later.' });
          }

          res.json({ message: 'Booking successful' });
        });
      });
    });
});


app.get('/api/booked-rooms', (req, res) => {
  const { roomType, checkinDate, checkoutDate } = req.query;

  if (!roomType || !checkinDate || !checkoutDate) {
    return res.status(400).json({ message: "Missing parameters" });
  }

  const query = `
    SELECT room_number FROM bookings 
    WHERE room_type = ? 
    AND (
      (checkin_date <= ? AND checkout_date >= ?) OR 
      (checkin_date >= ? AND checkin_date <= ?)
    )
  `;

  db.query(query, [roomType, checkoutDate, checkinDate, checkinDate, checkoutDate], (err, results) => {
    if (err) {
      console.error("Error fetching booked rooms:", err);
      return res.status(500).json({ message: "Database error" });
    }

    const bookedRooms = results.map(row => row.room_number);
    res.json({ bookedRooms });
  });
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});