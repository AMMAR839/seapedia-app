# SEAPEDIA Assessment Checklist

## Level 1

- Public landing page: `/`
- Public product listing: `/#/products`
- Product detail: `/#/products/{id}`
- Login and register: `/#/login`, `/#/register`
- Password hashing: PBKDF2-HMAC-SHA256
- JWT auth with active role
- Multi-role account: `multi / Multi123`
- Role selection: `/#/choose-role`
- Public application reviews: `/#/reviews`
- Reusable UI components: cards, buttons, inputs, navbar, panel, dashboard shell

## Level 2

- Seller store management: `/api/seller/store`
- Unique store name validation
- Product CRUD: `/api/seller/products`
- Product ownership checks
- Public catalog connected to backend data

## Level 3

- Buyer wallet: `/api/buyer/wallet`
- Dummy top-up: `/api/buyer/wallet/topup`
- Delivery address: `/api/buyer/addresses`
- Cart: `/api/buyer/cart`
- Single-store checkout rule enforced server-side
- Checkout summary and order creation
- PPN 12%, delivery fee, subtotal, final total
- Stock reduction prevents negative stock
- Buyer order history and Seller incoming order list

## Level 4

- Voucher and Promo resources
- Admin discount creation endpoints
- Discount validation during checkout
- Seller process order from `Sedang Dikemas` to `Menunggu Pengirim`
- Buyer and Seller reports
- Order timeline with timestamps

## Level 5

- Delivery job resource
- Driver available jobs
- Driver take job
- Driver complete job
- One Driver per order
- Driver earnings and job history

## Level 6

- Admin monitoring dashboard
- Users, stores, products, orders, vouchers, promos, delivery jobs, overdue orders
- Voucher and Promo management UI
- SLA rules by delivery method
- Simulate next day
- Auto return/refund to `Dikembalikan`
- Wallet refund, stock restoration, status history, double refund prevention

## Level 7

- SQL Injection prevention through ORM parameter binding
- XSS prevention by escaping public comments and dynamic frontend values
- Input validation through Pydantic schemas
- Active role enforced server-side
- Ownership authorization checks
- Swagger API documentation at `/docs`
- Demo accounts seeded
- README includes testing guide and security notes
