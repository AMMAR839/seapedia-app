# SEAPEDIA COMPFEST 18 | Express.js + Vue.js Marketplace

SEAPEDIA adalah fullstack marketplace API-based untuk challenge Software Engineering Academy COMPFEST 18. Project ini sudah dipisah menjadi backend Express.js dan frontend Vue.js, dengan dukungan Docker untuk masing-masing service.

Role yang didukung:

- Admin
- Seller
- Buyer
- Driver

Fitur utama:

- Public marketplace browsing, katalog produk, detail produk, dan detail toko.
- Authentication, register, login, JWT token, dan active role selection.
- Seller store management, Product CRUD, dan pemrosesan order.
- Buyer wallet, alamat pengiriman, cart single-store, checkout, PPN 12%, Voucher, dan Promo.
- Driver delivery job, take job, complete job, dan earning.
- Admin monitoring, analytics, Voucher/Promo management, audit trail, SLA check, auto return, dan refund.
- Security baseline: password hashing, input validation, active-role authorization, ownership checks, XSS escaping, dan SQL-injection resistance.

## Tech Stack

- Backend: Node.js + Express.js
- Frontend: Vue.js 3 + Vite
- Data store: JSON file persistence di `seapedia-data.json`
- API docs: `/docs` dan `/openapi.json`
- Auth: HMAC JWT-compatible token dengan active role claim
- Password security: PBKDF2-HMAC-SHA256 dengan random salt
- Container: Dockerfile backend, Dockerfile frontend, root Dockerfile, dan `docker-compose.yml`

## Struktur Project

```text
.
├── server.js                  # Thin entrypoint untuk start Express backend
├── backend/
│   ├── Dockerfile             # Docker image backend
│   └── src/
│       ├── app.js             # Express app factory
│       ├── server.js          # HTTP listen/bootstrap
│       ├── controllers/       # Request controllers
│       ├── routes/            # express.Router route declarations
│       ├── middleware/        # Security, not-found, error handler
│       └── core/              # Business rules, state, auth, persistence
├── frontend/                  # Vue.js frontend
│   ├── src/App.vue
│   ├── src/main.js
│   ├── src/style.css
│   ├── public/
│   ├── Dockerfile
│   └── nginx.conf
├── app/static/                # Legacy static assets fallback untuk backend
├── tests/e2e.test.js          # End-to-end API smoke test
└── docker-compose.yml
```

## Run Locally

Gunakan Node.js 18 atau lebih baru.

### 1. Install dependency

```bash
npm install
npm install --prefix frontend
```

### 2. Build Vue frontend

```bash
npm run frontend:build
```

### 3. Jalankan backend Express

```bash
npm start
```

Open:

- Web app: http://127.0.0.1:8000
- API docs: http://127.0.0.1:8000/docs
- OpenAPI JSON: http://127.0.0.1:8000/openapi.json
- Health check: http://127.0.0.1:8000/health

Data file `seapedia-data.json` akan dibuat otomatis saat backend pertama kali berjalan.

## Development Mode

Terminal 1:

```bash
npm start
```

Terminal 2:

```bash
npm run frontend:dev
```

Open Vue dev server:

```text
http://127.0.0.1:5173
```

Vite akan proxy request `/api`, `/health`, dan `/openapi.json` ke backend Express di port `8000`.

## Docker

### Dua container: backend + frontend

```bash
docker compose up --build
```

Open:

- Frontend Vue/Nginx: http://127.0.0.1:5173
- Backend Express API: http://127.0.0.1:8000

### Single image

Root `Dockerfile` membuild Vue frontend lalu menjalankan Express backend yang menyajikan hasil build frontend.

```bash
docker build -t seapedia-comfest18 .
docker run -p 8000:8000 -e SEAPEDIA_SECRET_KEY="replace-me" seapedia-comfest18
```

## Environment Variables

| Variable | Default | Purpose |
|---|---:|---|
| `SEAPEDIA_DATA_FILE` | `seapedia-data.json` | JSON data file path |
| `SEAPEDIA_SECRET_KEY` | `change-this-secret-in-production` | JWT signing secret |
| `SEAPEDIA_TOKEN_EXPIRE_MINUTES` | `480` | Token expiration in minutes |
| `SEAPEDIA_HOST` | `0.0.0.0` | Host binding |
| `SEAPEDIA_PORT` | `8000` | Backend port |

Untuk deployment, set `SEAPEDIA_SECRET_KEY` ke secret yang kuat.

## Seed Accounts

| Role | Username | Password | Notes |
|---|---|---|---|
| Admin | `admin` | `Admin123` | Monitoring, Voucher, Promo, SLA, audit trail |
| Seller | `seller` | `Seller123` | Store dan product management |
| Buyer | `buyer` | `Buyer123` | Wallet, address, cart, checkout |
| Driver | `driver` | `Driver123` | Delivery job workflow |
| Multi-role | `multi` | `Multi123` | Buyer, Seller, dan Driver dalam satu akun |

Admin dibuat dari seed data. Register publik tidak bisa membuat akun Admin.

## Business Rules

### Role and Authorization

- User dapat memiliki lebih dari satu role.
- Backend mewajibkan `active_role` di token.
- Endpoint Seller, Buyer, Driver, dan Admin dicek server-side berdasarkan active role.
- Ownership check mencegah Seller mengubah produk toko lain, Buyer mengubah cart/alamat/order user lain, dan Driver menyelesaikan job yang bukan miliknya.

### Checkout

- Cart hanya boleh berisi produk dari satu toko.
- Delivery method: `Instant`, `Next Day`, atau `Regular`.
- Diskon hanya satu kode per checkout.
- Voucher = potongan nominal dengan expiry date dan remaining usage.
- Promo = potongan persentase dengan expiry date.
- PPN 12% dihitung setelah diskon dan sebelum delivery fee.

Formula:

```text
discounted_subtotal = subtotal - discount
ppn = discounted_subtotal * 12%
final_total = discounted_subtotal + ppn + delivery_fee
```

### Delivery SLA

| Delivery Method | Fee | SLA |
|---|---:|---:|
| Instant | Rp25.000 | 1 day |
| Next Day | Rp15.000 | 2 days |
| Regular | Rp10.000 | 4 days |

Jika order melewati SLA dan masih aktif, Admin dapat menjalankan SLA check. Sistem akan mengubah status ke `Dikembalikan`, refund wallet Buyer, restore stock, update delivery job, dan menulis audit log.

### Order Lifecycle

1. `Sedang Dikemas`
2. `Menunggu Pengirim`
3. `Sedang Dikirim`
4. `Pesanan Selesai`
5. `Dikembalikan`

Setiap perubahan status memiliki history timestamp.

## API Endpoint Groups

- `/api/auth/*`
- `/api/products/*`
- `/api/stores/*`
- `/api/reviews/*`
- `/api/notifications/*`
- `/api/seller/*`
- `/api/buyer/*`
- `/api/driver/*`
- `/api/admin/*`

Endpoint nilai tambah:

- `GET /api/products?q=tuna&in_stock=true&sort=price_asc`
- `GET /api/stores/{store_id}`
- `GET /api/notifications`
- `POST /api/notifications/read-all`
- `GET /api/admin/analytics`
- `GET /api/admin/audit-logs`
- `GET /api/admin/products`
- `GET /api/admin/delivery-jobs`
- `GET /api/admin/vouchers/{voucher_id}`
- `GET /api/admin/promos/{promo_id}`

## Automated Verification

Run:

```bash
npm test
```

Test di `tests/e2e.test.js` mencakup:

- product browsing, product image asset, search/filter/sort, dan store detail
- XSS escaping pada public feedback endpoint
- login, multi-role selection, dan active-role authorization
- Buyer cart single-store rule, checkout summary, Voucher, dan PPN 12%
- Seller order processing
- Driver job detail, take job, complete job, dan earning
- Admin monitoring, analytics, discount detail, audit trail
- overdue handling, auto refund, wallet refund transaction

## Security Notes

- Password disimpan dengan PBKDF2-HMAC-SHA256 + random salt.
- Token memiliki `sub`, `roles`, `active_role`, dan `exp`.
- Public user-generated text di-escape sebelum disimpan.
- Backend tidak memakai raw SQL; semua mutasi memakai structured JSON data dan validation.
- Private endpoint memvalidasi active role dan ownership.
- Response memakai security headers seperti CSP, `X-Frame-Options`, dan `X-Content-Type-Options`.

## Deployment

### Render

Repository ini menyertakan `render.yaml` dan root Dockerfile.

1. Push project ke public GitHub repository.
2. Buat Render Blueprint.
3. Connect repository.
4. Set `SEAPEDIA_SECRET_KEY`.
5. Deploy.

## Suggested Git Commit History

```bash
git add .
git commit -m "init express backend and vue frontend"
git commit -m "add auth and active role selection"
git commit -m "add seller product management"
git commit -m "add buyer wallet cart and checkout"
git commit -m "add driver delivery workflow"
git commit -m "add admin analytics audit and sla refund"
git commit -m "add docker and verification docs"
```
