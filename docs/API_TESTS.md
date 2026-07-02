# Manual API Test Notes

Use `/docs` for API documentation and `/openapi.json` for the OpenAPI document.

## Automated Smoke Test

Run:

```bash
npm test
```

The test in `tests/e2e.test.js` verifies the integrated Level 1-7 flow: public feedback security, active-role auth, Buyer cart and checkout, Seller processing, Driver delivery completion, Admin monitoring/detail endpoints, and overdue refund.

## Auth

1. `POST /api/auth/login`
2. Copy `access_token`
3. Send authenticated requests with header: `Authorization: Bearer <token>`
4. For multi-role user, call `POST /api/auth/choose-role`

## Security Tests

### XSS

`POST /api/reviews`

```json
{
  "reviewer_name": "Tester",
  "rating": 5,
  "comment": "<script>alert('xss')</script>"
}
```

Expected: the comment is escaped and displayed as text.

### SQL-like Login Payload

`POST /api/auth/login`

```json
{
  "username": "admin' OR '1'='1",
  "password": "anything"
}
```

Expected: login fails. Database remains unchanged.

### Active Role Enforcement

Login as `multi`. Choose Buyer. Try calling `/api/seller/store`. Expected: 403.

Choose Seller. Try calling `/api/buyer/wallet`. Expected: 403.

## Detail Endpoint Checks

- Buyer order detail: `GET /api/buyer/orders/{order_id}`
- Driver job detail: `GET /api/driver/jobs/{job_id}`
- Admin product monitoring: `GET /api/admin/products`
- Admin delivery-job monitoring: `GET /api/admin/delivery-jobs`
- Admin voucher detail: `GET /api/admin/vouchers/{voucher_id}`
- Admin promo detail: `GET /api/admin/promos/{promo_id}`

## Value-Added API Checks

- Catalog search/filter/sort: `GET /api/products?q=tuna&in_stock=true&sort=price_asc`
- Public store detail: `GET /api/stores/{store_id}`
- Role notifications: `GET /api/notifications`
- Mark notifications read: `POST /api/notifications/read-all`
- Admin analytics: `GET /api/admin/analytics`
- Admin audit trail: `GET /api/admin/audit-logs`
