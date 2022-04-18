import express, { query } from 'express';
import { read, add, edit, write } from './jsonFileStorage.js';
import methodOverride from 'method-override'
import cookieParser from 'cookie-parser';
import jsSHA from 'jssha';
import axios from 'axios';
import pg from 'pg';
import moment from 'moment';

const app = express();
app.set('view engine', 'ejs');

// Configure Express to parse request body data into request.body
app.use(express.urlencoded({ extended: false }));
app.use(methodOverride('_method'));
app.use(express.static('public'))
app.use(cookieParser());

const PORT = 3001;


// set the way we will connect to the server
const pgConnectionConfigs = {
  user: 'leo',
  host: 'localhost',
  database: 'car_rental',
  port: 5432, // Postgres server always runs on this port
};

const { Pool } = pg;
const pool = new Pool(pgConnectionConfigs);

function replaceAll(str, find, replace) {
  return str.replace(new RegExp(find, 'g'), replace);
}

const checkAuth = (req, res, next) => {
  const {userId} = req.cookies;
  if (userId) {
  const values = [userId];
  // console.log(req.body.email)
  pool.query('SELECT * FROM user_accounts WHERE user_id=$1', values, (error, result) => {
    // return if there is a query error
    if (error) {
      console.log('Error executing query', error.stack);
      res.status(503).send(result.rows);
      return;
    };

    const user = result.rows[0];
    const email = user.email
  
    const { loggedInHash } = req.cookies;
    // create new SHA object
    const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
    // reconstruct the hashed cookie string
    const unhashedCookieString = `${email}-${process.env['SALT']}`;
    shaObj.update(unhashedCookieString);
    const hashedCookieString = shaObj.getHash('HEX');

    // verify if the generated hashed cookie string matches the request cookie value.
    // if hashed value doesn't match, return 403.
    if (hashedCookieString !== loggedInHash) {
      res.status(403).send('please login!');
      return;
    }
    next();
  } )
  } else {
    res.status(403).send('please login!');
    return;
  }
}

const insertNewData = (newData, tableName, columnName) => {
  const insert = `INSERT INTO ${tableName} (${columnName})`
  const condition = `SELECT '${newData}' WHERE NOT EXISTS (SELECT * FROM ${tableName} WHERE ${columnName} = '${newData}')`
  const query = `${insert} ${condition}`
  return query
}

app.get('/login', (req, res) => {
  res.render('loginPage');
})

app.get('/signup', (req, res) => {
  res.render('accountForm');
})

// password hashing
app.post('/signup', (req, res) => {
  const form = req.body;
  
  // initialise the SHA object
  const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
  // input the password from the req to the SHA object
  shaObj.update(form.password);
  // get the hashed password as output from the SHA object
  const hashedPassword = shaObj.getHash('HEX');

  // store the hashed password in our DB
  const user = [form.name, form.email, form.phone, form.age, hashedPassword, 'F'];
  pool.query(
    'INSERT INTO user_accounts (name, email, phone, age, password, superuser) VALUES ($1, $2, $3, $4, $5, $6)',
    user,
    (err, result) => {
      if (err) {
        return res.status(400).send(err);
      }

      res.render('signupComplete')
    }
  )
});

app.post('/login', (req, res) => {
  // retrieve the user entry using their email
  const values = [req.body.email];
  console.log(req.body.email)
  pool.query('SELECT * FROM user_accounts WHERE email=$1', values, (error, result) => {
    // return if there is a query error
    if (error) {
      console.log('Error executing query', error.stack);
      res.status(503).send(result.rows);
      return;
    }

    // we didnt find a user with that email
    if (result.rows.length === 0) {
      // the error for incorrect email and incorrect password are the same for security reasons.
      // This is to prevent detection of whether a user has an account for a given service.
      res.status(403).send('login failed spectacularly!');
      return;
    }

    // get user record from results
    const user = result.rows[0];
    // initialise SHA object
    const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
    // input the password from the req to the SHA object
    shaObj.update(req.body.password);
    // get the hashed value as output from the SHA object
    const hashedPassword = shaObj.getHash('HEX');

    // If the user's hashed password in the database does not match the hashed input password, login fails
    if (user.password !== hashedPassword) {
      // the error for incorrect email and incorrect password are the same for security reasons.
      // This is to prevent detection of whether a user has an account for a given service.
      res.status(403).send('login failed!');
      return;
    } else {
      const unhashedCookieString = `${user.email}-${process.env['SALT']}`
      const shaStr = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
      shaStr.update(unhashedCookieString);
      const hashedCookieString = shaStr.getHash('HEX');
      res.cookie('loggedInHash', hashedCookieString)
      res.cookie('userId', user.user_id)
    }

    if (user.superuser === 'T') {
      res.cookie('superuser', true)
    }

    // The user's password hash matches that in the DB and we authenticate the user.
    // res.cookie('loggedIn', true);
    res.redirect('/home');
  });
});

app.get('/logout', (req, res) => {
  res.clearCookie('loggedInHash');
  res.clearCookie('userId');
  const {superuser} = req.cookies;
  if (superuser) {
    res.clearCookie('superuser');
  }
  res.redirect('/login');
})

app.get('/home', checkAuth, (req, res) => {
  const {userId} = req.cookies;
  const values = [userId];
  pool.query('SELECT name FROM user_accounts WHERE user_id=$1', values, (err, result) => {
    if (err) {
      res.status(503).send('Failed SQL query');
    }

    const {name} = result.rows[0];
    const ejsObject = {name}

    res.render('homePage', ejsObject)
  })
})

//#region Cars

app.get('/cars', checkAuth, (req, res) => {
  let {superuser} = req.cookies;
  if (superuser) {
    superuser = true
  } else {
    superuser = false
  }
  const select = 'SELECT car_id, b.brand_name, c.category_name, rental_price FROM cars'
  const innerJoin1 = 'INNER JOIN brands b ON b.brand_id = cars.brand_id'
  const innerJoin2 = 'INNER JOIN categories c ON c.category_id = cars.category_id'
  const order = 'ORDER BY b.brand_name ASC, c.category_name ASC'
  pool.query(
    `${select} ${innerJoin1} ${innerJoin2} ${order}`
    ).then(
      (result) => {
        // console.log(result.rows)
        const carsData = result.rows
        const ejsObject = {carsData , superuser}
        // console.log(ejsObject)
        res.render('carsPage', ejsObject)
      }).catch((err) => {res.status(503).send(`${err.stack}`)})
})

app.get('/cars/add', checkAuth, (req, res) => {
  res.render('carForm')
})

app.post('/cars/add', checkAuth, (req, res) => {
  const {superuser} = req.cookies;
  if (superuser) {
    const newCar = req.body
    const newBrand = newCar.brand
    const newCategory = newCar.category
    const newPrice = newCar.price
    pool.query(
      insertNewData(newBrand, 'brands', 'brand_name')
      ).then(
        pool.query(
          insertNewData(newCategory, 'categories', 'category_name')
        ).then(()=> {
            const arrayResults = Promise.all([
              pool.query('SELECT brand_id FROM brands WHERE brand_name = $1', [newBrand]),
              pool.query('SELECT category_id FROM categories WHERE category_name = $1', [newCategory]),
              newPrice
            ])
            
            arrayResults.then((result) => {
              const brandID = result[0].rows[0].brand_id
              const catID = result[1].rows[0].category_id
              const price = result[2]
              const values = [brandID, catID, price]
              const insert = 'INSERT INTO cars (brand_id, category_id, rental_price)'
              const select = 'SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT * FROM cars WHERE brand_id = $1 AND category_id = $2)'
              pool.query(`${insert} ${select}`, values).then(()=>{
                res.redirect('/cars')
              }).catch((err) => {res.status(503).send(`${err.stack}`)})
            }).catch((err) => {res.status(503).send(`${err.stack}`)})
          })
        )
  } else {
    res.status(401).send('Access Denied')
  }
})

app.get('/cars/:carID/edit', checkAuth, (req, res) => {
  const {superuser} = req.cookies;
  if (superuser) {
    const carID = Number(req.params.carID);
    const values = [carID]
    const select = 'SELECT car_id, b.brand_name, c.category_name, rental_price FROM cars'
    const innerJoin1 = 'INNER JOIN brands b ON b.brand_id = cars.brand_id'
    const innerJoin2 = 'INNER JOIN categories c ON c.category_id = cars.category_id'
    const where = 'WHERE car_id = $1'
    pool.query(
      `${select} ${innerJoin1} ${innerJoin2} ${where}`, values
      ).then(
        (result) => {
          const singleCar = result.rows[0]
          const ejsObject = {singleCar}
          res.render('carForm', ejsObject)
        }
        ).catch((err) => {res.status(503).send(`${err.stack}`)})
  } else {
    res.status(401).send('Access Denied')
  }
}
)

app.put('/cars/:carID/edit', checkAuth, (req, res) => {
  const {superuser} = req.cookies;
  if (superuser) {
    const carID = Number(req.params.carID);
    const newPrice = req.body.price;
    const values = [carID, newPrice]
    const update = 'UPDATE cars'
    const set = 'set rental_price = $2'
    const where = 'WHERE car_id = $1'
    pool.query(
      `${update} ${set} ${where}`, values
      ).then(
        (result) => {
          res.redirect('/cars')
        }
        ).catch((err) => {res.status(503).send(`${err.stack}`)})
  } else {
    res.status(401).send('Access Denied')
  }
}
)

app.delete('/cars/:carID/delete', (req, res) => {
  const {superuser} = req.cookies;
  if (superuser) {
    const carID = Number(req.params.carID);
    const del = 'DELETE FROM cars'
    const where = 'WHERE car_id = $1'
    pool.query(
      `${del} ${where}`, [carID]
      ).then(
        (result) => {
          res.redirect('/cars')
        }
        ).catch((err) => {res.status(503).send(`${err.stack}`)})
  } else {
    res.status(401).send('Access Denied')
  }
})
//#endregion

app.get('/newOrder', checkAuth, (req, res) => {
  const arrayResults = Promise.all([
    pool.query('SELECT brand_name FROM brands'),
    pool.query('SELECT category_name FROM categories')
  ])

  arrayResults.then((results) => {
    const brands = results[0].rows
    const categories = results[1].rows
    const ejsObject = {brands , categories}
    res.render('orderForm', ejsObject);
  }).catch((err) => {res.status(503).send(`${err.stack}`)})
})

app.get('/newOrder/confirm', checkAuth, (req, res) => {
  // console.log(req)
  const orderDetails = req.query
  const {brand} = orderDetails
  const {category} = orderDetails
  console.log(orderDetails.startDate)
  const startDate = new Date(orderDetails.startDate)
  const endDate = new Date(orderDetails.endDate)
  const days = parseInt((endDate - startDate) / (1000*60*60*24))
  console.log('DAYS COUNTED ---> ', days)

  const values = [brand, category]
  const select = 'SELECT car_id, rental_price FROM cars'
  const innerJoin1 = 'INNER JOIN brands b ON b.brand_id = cars.brand_id'
  const innerJoin2 = 'INNER JOIN categories c ON c.category_id = cars.category_id'
  const where = 'WHERE b.brand_name = $1 AND c.category_name = $2'
  pool.query(
    `${select} ${innerJoin1} ${innerJoin2} ${where}`, values
  ).then((results) => {
    const data = results.rows[0]
    const rentalCost = days * data.rental_price
    const carId = data.car_id
    const startDateString = orderDetails.startDate
    const endDateString = orderDetails.endDate
    const ejsObject = {brand, category, carId, startDateString, endDateString, rentalCost}
    console.log('NEW ORDER --> ', ejsObject)

    res.render('confirmOrder', ejsObject)
  }).catch((err) => {res.status(503).send(`${err.stack}`)})
})

app.post('/newOrder', checkAuth, (req, res) => {
  const orderDetails = req.body
  console.log(orderDetails)
  const userId = Number(req.cookies.userId)
  const {carId} = orderDetails
  const startDate = new Date(orderDetails.startDate)
  const endDate = new Date(orderDetails.endDate)
  const {rentalCost} = orderDetails

  const insert = 'INSERT INTO orders (user_id, car_id, start_date, end_date, rental_cost)'
  const select = 'SELECT $1, $2, $3, $4, $5'
  const values = [userId, carId, startDate, endDate, rentalCost]
  console.log(values)
  pool.query(
    `${insert} ${select}`, values
  ).then(() => {
    res.redirect('/existingOrder')
    }).catch((err) => {res.status(503).send(`${err.stack}`)})
})

app.get('/existingOrder', checkAuth, (req, res) => {
  const userId = Number(req.cookies.userId)
  const select = 'SELECT order_id, brand_name, category_name, start_date, end_date, rental_cost FROM orders'
  const innerJoin1 = 'INNER JOIN cars ON cars.car_id = orders.car_id'
  const innerJoin2 = 'INNER JOIN brands b ON b.brand_id = cars.brand_id'
  const innerJoin3 = 'INNER JOIN categories c ON c.category_id = cars.category_id'
  const where = 'WHERE orders.user_id = $1'
  pool.query(
    `${select} ${innerJoin1} ${innerJoin2} ${innerJoin3} ${where}`, [userId]
    ).then((results) => {
      const orders = results.rows
      orders.forEach((element) => {
        element.start_date = moment(element.start_date).format("DD/MM/YYYY")
        element.end_date = moment(element.end_date).format("DD/MM/YYYY")
      })
      const ejsObject = {orders}
      console.log('EXISTING ORDERS --> ', ejsObject)
      res.render('orderPage', ejsObject)
    }).catch((err) => {res.status(503).send(`${err.stack}`)})
})

app.get('/existingOrder/:orderId/edit', checkAuth, (req, res) => {
  const orderId = Number(req.params.orderId)
  const orderData = req.query
  console.log("ORDER DATA ---------------> ", orderData)
  // orderData.startDate = replaceAll(orderData.startDate, '/', '-')
  // orderData.endDate = replaceAll(orderData.endDate, '/', '-')
  // orderData.startDate = new Date(orderData.startDate)
  // const startDateArray = orderData.startDate.split('/')
  // console.log(startDateArray)
  // const startDate = Date.parse(`${startDateArray[2]-startDateArray[1]-startDateArray[0]}`)
  // orderData.startDate = startDate

  setImmediate(() => {
    const arrayResults = Promise.all([
    pool.query('SELECT brand_name FROM brands'),
    pool.query('SELECT category_name FROM categories')
  ])

  arrayResults.then((results) => {
    const brands = results[0].rows
    const categories = results[1].rows
    const ejsObject = {brands , categories , orderData , orderId}
    console.log(orderData.startDate)
    console.log(typeof(orderData.startDate))
    res.render('orderForm', ejsObject);
  }).catch((err) => {res.status(503).send(`${err.stack}`)})
  })
  
})

app.put('/existingOrder/:orderId/edit', checkAuth, (req, res) => {
  const orderId = Number(req.params.orderId)

  const orderDetails = req.body
  const {brand} = orderDetails
  const {category} = orderDetails
  const startDate = new Date(orderDetails.startDate)
  const endDate = new Date(orderDetails.endDate)
  const days = parseInt((endDate - startDate) / (1000*60*60*24))
  console.log('DAYS COUNTED ---> ', days)

  const values = [brand, category]
  const select = 'SELECT car_id, rental_price FROM cars'
  const innerJoin1 = 'INNER JOIN brands b ON b.brand_id = cars.brand_id'
  const innerJoin2 = 'INNER JOIN categories c ON c.category_id = cars.category_id'
  const where = 'WHERE b.brand_name = $1 AND c.category_name = $2'
  pool.query(
    `${select} ${innerJoin1} ${innerJoin2} ${where}`, values
  ).then((results) => {
    const data = results.rows[0]
    const rentalCost = days * data.rental_price
    const order = [orderId, data.car_id, startDate, endDate, rentalCost]
    console.log('NEW ORDER --> ', order)

    const update = 'UPDATE orders'
    const set = 'set car_id = $2, start_date = $3, end_date = $4, rental_cost = $5'
    const where = 'WHERE order_id = $1'
    pool.query(
      `${update} ${set} ${where}`, order
      ).then(()=>{
        res.redirect('/existingOrder')
      }).catch((err) => {res.status(503).send(`${err.stack}`)})
  }).catch((err) => {res.status(503).send(`${err.stack}`)})
})

app.delete('/existingOrder/:orderId/delete', checkAuth, (req, res) => {
  const orderId = Number(req.params.orderId)

  const del = 'DELETE FROM orders'
  const where = 'WHERE order_id = $1'
  pool.query(
    `${del} ${where}`, [orderId]
  ).then(() => {
    res.redirect('/existingOrder')
  }).catch((err) => {res.status(503).send(`${err.stack}`)})
})


app.listen(PORT);