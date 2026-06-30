# SEAPEDIA COMPFEST 18 | Fullstack Marketplace Challenge

SEAPEDIA is a fullstack API-based marketplace demo for the Software Engineering Academy COMPFEST 18 technical challenge. It supports four roles in one marketplace ecosystem:

- Admin
- Seller
- Buyer
- Driver

The app includes public marketplace browsing, authentication, active role selection, public application reviews, seller store and product management, buyer wallet, single-store cart, checkout, Voucher and Promo discounts, seller order processing, driver delivery workflow, admin monitoring, overdue auto refund, and baseline security hardening.

## Tech Stack

- Backend: FastAPI
- Database: SQLite with SQLAlchemy ORM
- Frontend: Vanilla HTML, CSS, and JavaScript served by FastAPI
- API docs: Swagger UI at `/docs`
- Auth: JWT with active role claim
- Password security: PBKDF2-HMAC-SHA256 with random salt

## Run Locally

### 1. Clone and enter the project

```bash
git clone <your-public-repository-url>
cd seapedia-comfest18
```

### 2. Create virtual environment

```bash
python -m venv .venv
source .venv/bin/activate
```

On Windows:

```bash
python -m venv .venv
.venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the app

```bash
uvicorn app.main:app --reload
```

Open:

- Web app: http://127.0.0.1:8000
- Swagger API docs: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health

The SQLite database will be created automatically as `seapedia.db` after the app starts.

## Environment Variables

| Variable | Default | Purpose |
|---|---:|---|
| `SEAPEDIA_DATABASE_URL` | `sqlite:///seapedia.db` | Database connection URL |
| `SEAPEDIA_SECRET_KEY` | `change-this-secret-in-production` | JWT signing secret |
| `SEAPEDIA_TOKEN_EXPIRE_MINUTES` | `480` | Token expiration in minutes |
| `SEAPEDIA_HOST` | `0.0.0.0` | Docker host |
| `SEAPEDIA_PORT` | `8000` | Docker port |

For production or deployment, set `SEAPEDIA_SECRET_KEY` to a strong secret.

## Demo Accounts

| Role | Username | Password | Notes |
|---|---|---|---|
| Admin | `admin` | `Admin123` | Admin monitoring, Voucher, Promo, overdue simulation |
| Seller | `seller` | `Seller123` | Store and product management |
| Buyer | `buyer` | `Buyer123` | Wallet, address, cart, checkout |
| Driver | `driver` | `Driver123` | Available jobs, take job, complete job |
| Multi-role | `multi` | `Multi123` | Owns Buyer, Seller, and Driver roles. Must choose active role after login |

Admin is seeded. New public registrations cannot create Admin accounts.

## Role and Authorization Rule

SEAPEDIA supports four roles: Admin, Seller, Buyer, and Driver.

A non-admin user can own more than one role. The backend requires an `active_role` inside the JWT token. A user who owns Buyer and Seller cannot call Seller endpoints while their active role is Buyer.

This rule is enforced in backend dependencies, not only in the frontend navigation.

## Main Business Rules Implemented

### Public Marketplace

- Guests can browse products.
- Guests can open product details.
- Guests can submit public application reviews.
- Public review comments render as text and are escaped before storage.

### Authentication

- Registration supports Buyer, Seller, and Driver roles.
- Login returns owned roles.
- Multi-role users must choose an active role.
- Private endpoints check the active role server-side.
- Logout clears the client token.

### Seller

- Seller can create or update a store.
- Store name is unique.
- Seller can create, update, and delete only their own products.
- Products appear in the public catalog.
- Seller can process incoming orders from `Sedang Dikemas` to `Menunggu Pengirim`.

### Buyer

- Buyer has a wallet balance.
- Buyer can top up using dummy top-up.
- Wallet transaction history is stored.
- Buyer can manage delivery addresses.
- Buyer can add, update, remove, or clear cart items.
- Cart follows single-store checkout.
- Buyer can checkout using `Instant`, `Next Day`, or `Regular` delivery.
- Buyer can view order history, detail, and status timeline.

### Cart Single-Store Checkout Rule

One cart can contain products from only one store.

If a Buyer tries to add a product from another store, the backend rejects it with this message:

```text
Single-store checkout: cart hanya boleh berisi produk dari satu toko. Kosongkan cart sebelum menambah produk toko lain.
```

The UI also displays this rule in the cart page.

### Checkout Calculation Rule

Checkout summary shows:

- Subtotal
- Discount
- Delivery fee
- PPN 12%
- Final total

Formula:

```text
discounted_subtotal = subtotal - discount
ppn = discounted_subtotal * 12%
final_total = discounted_subtotal + ppn + delivery_fee
```

PPN is calculated after discount and before delivery fee is added to the final total.

### Delivery Fee Rule

| Delivery Method | Fee | SLA |
|---|---:|---:|
| Instant | Rp25.000 | 1 day |
| Next Day | Rp15.000 | 2 days |
| Regular | Rp10.000 | 4 days |

### Discount Rule

SEAPEDIA supports one discount code per checkout.

| Type | Rule |
|---|---|
| Voucher | Fixed nominal discount. Has expiry date and remaining usage |
| Promo | Percentage discount. Has expiry date |

Seeded codes:

- `HEMAT25`: Voucher Rp25.000, 20 usages
- `PROMO10`: Promo 10%

Voucher and Promo cannot be combined in one checkout.

### Order Lifecycle

User-facing statuses:

1. `Sedang Dikemas`
2. `Menunggu Pengirim`
3. `Sedang Dikirim`
4. `Pesanan Selesai`
5. `Dikembalikan`

Every status change creates status history with timestamp.

### Driver Workflow

- Driver only sees jobs after Seller processes the order.
- Driver can take a job only when order status is `Menunggu Pengirim`.
- Taking a job changes order status to `Sedang Dikirim`.
- Completing a job changes order status to `Pesanan Selesai`.
- One order can only have one active Driver.

### Driver Earning Rule

```text
Driver earning = 80% of delivery fee for completed jobs
```

Driver earnings appear in Driver dashboard and `/api/driver/dashboard`.

### Seller Income Rule

```text
Seller income = subtotal - discount for orders with status Pesanan Selesai
```

Delivery fee and PPN are not counted as Seller income.
Returned or refunded orders are not counted as Seller income.

### Overdue Auto Return and Refund

Admin can simulate time progression from the Admin dashboard.

Options:

- `POST /api/admin/simulate-next-day`
- `POST /api/admin/run-overdue-check`

When an order passes its delivery SLA and is still in an active status, the system:

1. Moves the order to `Dikembalikan`.
2. Refunds the Buyer wallet with the order final total.
3. Records the refund in wallet transaction history.
4. Restores product stock.
5. Updates the delivery job to `Returned` if not completed.
6. Adds visible order status history.
7. Prevents double refund by checking `is_refunded`.

## API Documentation

Run the app and open:

```text
http://127.0.0.1:8000/docs
```

FastAPI automatically generates Swagger/OpenAPI documentation for all endpoints.

Main endpoint groups:

- `/api/auth/*`
- `/api/products/*`
- `/api/reviews/*`
- `/api/seller/*`
- `/api/buyer/*`
- `/api/driver/*`
- `/api/admin/*`

## End-to-End Demo Guide

### Flow 1: Guest and Review

1. Open home page.
2. Open product catalog.
3. Open product detail.
4. Open Review page.
5. Submit a review with a safe or unsafe script test comment.
6. Confirm the comment appears as text, not executable script.

Suggested XSS test:

```html
<script>alert('xss')</script>
```

Expected result: it is displayed as escaped text.

### Flow 2: Buyer Checkout

1. Login as `buyer` with `Buyer123`.
2. Open Dashboard.
3. Confirm wallet has seeded balance.
4. Add product from catalog to cart.
5. Select address.
6. Select delivery method.
7. Use `HEMAT25` or `PROMO10`.
8. View checkout summary.
9. Confirm checkout.
10. Confirm order starts as `Sedang Dikemas`.

### Flow 3: Seller Processing

1. Login as `seller` with `Seller123`.
2. Open Dashboard.
3. Check store and products.
4. Open Orders tab.
5. Process the Buyer order.
6. Confirm status changes to `Menunggu Pengirim`.

### Flow 4: Driver Delivery

1. Login as `driver` with `Driver123`.
2. Open Driver Dashboard.
3. Find available job.
4. Take job.
5. Confirm status changes to `Sedang Dikirim`.
6. Complete job.
7. Confirm status changes to `Pesanan Selesai`.
8. Confirm Driver earning appears.

### Flow 5: Admin Monitoring and Overdue

1. Login as `admin` with `Admin123`.
2. Open Admin Dashboard.
3. View counts for users, stores, products, orders, discounts, and delivery jobs.
4. Create Voucher or Promo.
5. Create a Buyer checkout but do not complete delivery.
6. Click `Simulate Next Day` until the order exceeds its SLA.
7. Confirm auto return/refund changes order status to `Dikembalikan`.
8. Confirm Buyer wallet has refund transaction.

## Security Notes

### SQL Injection Prevention

The backend uses SQLAlchemy ORM queries and parameter binding. User input is not interpolated into raw SQL strings.

### XSS Prevention

Public user-generated text is escaped with `html.escape()` before storage. The frontend also escapes dynamic values before writing them into HTML templates.

### Input Validation

Pydantic validates:

- Email format
- Phone format
- Rating range 1 to 5
- Product price greater than 0
- Stock greater than or equal to 0
- Cart quantity greater than 0
- Discount value and percentage range
- Delivery method enum

Invalid input returns clear JSON errors.

### Session and Token Behavior

- JWT token includes `sub`, `roles`, `active_role`, and `exp`.
- Default expiration is 480 minutes.
- Logout clears the token on the client.
- Production deployment should set a strong `SEAPEDIA_SECRET_KEY`.

### Role-Based Access Control

Backend dependencies enforce active role:

- Seller endpoints require active role `Seller`.
- Buyer endpoints require active role `Buyer`.
- Driver endpoints require active role `Driver`.
- Admin endpoints require active role `Admin`.

Ownership checks prevent cross-user modification:

- Seller can manage only their store and products.
- Buyer can manage only their cart, address, wallet, and orders.
- Driver can complete only jobs they took.
- Admin-only pages and endpoints reject non-admin active roles.

## Deployment

### Docker

```bash
docker build -t seapedia-comfest18 .
docker run -p 8000:8000 -e SEAPEDIA_SECRET_KEY="replace-me" seapedia-comfest18
```

### Render

This repository includes `render.yaml`.

1. Push the project to a public GitHub repository.
2. Create a new Render Blueprint.
3. Connect the repository.
4. Set `SEAPEDIA_SECRET_KEY` if needed.
5. Deploy.

## Suggested Git Commit History

Use separate commits so evaluators can see the development process.

```bash
git add .
git commit -m "init project structure"
git commit -m "add auth and role selection"
git commit -m "add seller store and product management"
git commit -m "add buyer wallet cart and checkout"
git commit -m "add discounts and seller order processing"
git commit -m "add driver delivery workflow"
git commit -m "add admin monitoring and overdue refund"
git commit -m "add security hardening and documentation"
```

The submitted ZIP already contains a local git history if the `.git` folder is preserved. If your platform strips hidden folders, use the commands above after extracting and before pushing.
# seapedia-app
