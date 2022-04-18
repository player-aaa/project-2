insert into brands (brand_name)
Select 'Lexus' Where not exists(select * from brands where brand_name = 'Lexus')