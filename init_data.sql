INSERT INTO user_accounts (name, email, password, superuser)
VALUES ('admin', 'adminuser@drive.com', 'b1572ca5ddec0c9ad748393ee40d1aaddf3caecead8211b472f4ce73a957ff8be7c4a766b87daf0cdc88109155c516ceac9ff8794aa838ecd6c1794e156a735e', 'T');

INSERT INTO brands (brand_name)
VALUES ('Toyota'), ('Honda'), ('Mercedes');

INSERT INTO categories (category_name)
VALUES ('Sedan'), ('SUV');

INSERT INTO cars (brand_id, category_id, rental_price)
VALUES
(1, 1, 50),
(1, 2, 55),
(2, 1, 60),
(2, 2, 65),
(3, 1, 100),
(3, 2, 150);