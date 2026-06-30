# Manual API Test Notes

Use Swagger UI at `/docs` for complete API documentation.

## Auth

1. `POST /api/auth/login`
2. Copy `access_token`
3. Click `Authorize` in Swagger and paste: `Bearer <token>`
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
