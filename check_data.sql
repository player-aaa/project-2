SELECT * FROM orders;
SELECT * FROM cars;
SELECT * FROM brands;
SELECT * FROM categories;
SELECT * FROM user_accounts;

SELECT car_id, b.brand_name, c.category_name, rental_price FROM cars
INNER JOIN brands b ON b.brand_id = cars.brand_id
INNER JOIN categories c ON c.category_id = cars.category_id
ORDER BY car_id ASC;