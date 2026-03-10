-- KLARix Database Schema & Sample Data

DROP TABLE IF EXISTS market_share;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS products;

CREATE TABLE products (
  product_id   VARCHAR(10) PRIMARY KEY,
  name         VARCHAR(100),
  category     VARCHAR(50),
  sub_category VARCHAR(50),
  price        DECIMAL(10,2),
  cost         DECIMAL(10,2),
  launch_year  INT
);

CREATE TABLE sales (
  sale_id    VARCHAR(10) PRIMARY KEY,
  product_id VARCHAR(10),
  region     VARCHAR(20),
  channel    VARCHAR(50),
  month      VARCHAR(10),
  year       INT,
  units      INT,
  revenue    DECIMAL(10,2)
);

CREATE TABLE customers (
  customer_id      VARCHAR(10) PRIMARY KEY,
  name             VARCHAR(100),
  region           VARCHAR(20),
  tier             VARCHAR(20),
  annual_spend     DECIMAL(10,2),
  acquisition_year INT
);

CREATE TABLE market_share (
  brand      VARCHAR(50),
  category   VARCHAR(50),
  region     VARCHAR(20),
  quarter    VARCHAR(10),
  share_pct  DECIMAL(5,2)
);

INSERT INTO products VALUES
('P001','Sparkling Mango Burst','Beverages','Sparkling',2.5,0.9,2021),
('P002','Classic Cola Zero','Beverages','Cola',1.8,0.6,2019),
('P003','Oat Milk Latte','Dairy Alt','RTD Coffee',3.5,1.4,2022),
('P004','Green Tea Zen','Beverages','Tea',2.2,0.8,2020),
('P005','Tropical Punch','Beverages','Juice',1.9,0.7,2018),
('P006','Protein Shake Vanilla','Nutrition','Protein',4.5,1.8,2021),
('P007','Coconut Water Pure','Beverages','Coconut',2.8,1.0,2020),
('P008','Energy Blast Red','Energy','Energy Drink',3.2,1.1,2022);

INSERT INTO sales VALUES
('S001','P001','North','Modern Trade','Jan',2024,12400,31000),
('S002','P002','South','General Trade','Jan',2024,18900,34020),
('S003','P003','West','E-Commerce','Jan',2024,5600,19600),
('S004','P001','East','Modern Trade','Feb',2024,14200,35500),
('S005','P004','North','General Trade','Feb',2024,9800,21560),
('S006','P005','South','Modern Trade','Feb',2024,22100,41990),
('S007','P006','West','E-Commerce','Mar',2024,3200,14400),
('S008','P007','East','Modern Trade','Mar',2024,8700,24360),
('S009','P008','North','E-Commerce','Mar',2024,6500,20800),
('S010','P002','West','General Trade','Apr',2024,21300,38340),
('S011','P003','South','E-Commerce','Apr',2024,7100,24850),
('S012','P001','North','Modern Trade','Apr',2024,16800,42000),
('S013','P005','East','General Trade','May',2024,19200,36480),
('S014','P006','North','Modern Trade','May',2024,4400,19800),
('S015','P008','South','E-Commerce','Jun',2024,8900,28480),
('S016','P004','West','Modern Trade','Jun',2024,11200,24640),
('S017','P007','South','General Trade','Jun',2024,13400,37520),
('S018','P002','East','Modern Trade','Jun',2024,17600,31680);

INSERT INTO customers VALUES
('C001','Metro Hypermart','North','Premium',480000,2018),
('C002','QuickShop Chain','South','Standard',210000,2020),
('C003','FreshMart Online','West','Premium',390000,2019),
('C004','Sunrise Grocers','East','Standard',145000,2021),
('C005','Urban Express','North','Gold',310000,2019),
('C006','ValueMart','South','Standard',175000,2022),
('C007','PremiumPick','West','Gold',265000,2020),
('C008','EasyBuy Stores','East','Premium',420000,2017),
('C009','Global Mart','West','Gold',285000,2023);

INSERT INTO market_share VALUES
('KLARix Portfolio','Beverages','North','Q1 2024',18.4),
('Competitor A','Beverages','North','Q1 2024',24.1),
('Competitor B','Beverages','North','Q1 2024',15.7),
('KLARix Portfolio','Beverages','South','Q1 2024',22.6),
('Competitor A','Beverages','South','Q1 2024',19.3),
('KLARix Portfolio','Energy','North','Q1 2024',11.2),
('Competitor C','Energy','North','Q1 2024',38.5),
('KLARix Portfolio','Nutrition','West','Q1 2024',9.8),
('KLARix Portfolio','Beverages','North','Q2 2024',19.8),
('Competitor A','Beverages','North','Q2 2024',22.9);
