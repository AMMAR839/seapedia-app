const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

process.env.SEAPEDIA_SECRET_KEY = "test-secret-key-with-at-least-32-bytes";
process.env.SEAPEDIA_DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "seapedia-")), "data.json");

const { startServer } = require("../server");

async function request(baseUrl, method, pathname, body, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { response, data };
}

async function authHeaders(baseUrl, username, password, role = null) {
  const login = await request(baseUrl, "POST", "/api/auth/login", { username, password });
  assert.equal(login.response.status, 200, login.data.detail);
  let token = login.data.access_token;
  if (role && login.data.active_role !== role) {
    const choose = await request(baseUrl, "POST", "/api/auth/choose-role", { role }, { Authorization: `Bearer ${token}` });
    assert.equal(choose.response.status, 200, choose.data.detail);
    token = choose.data.access_token;
  }
  return { Authorization: `Bearer ${token}` };
}

test("Level 1-7 SEAPEDIA flow works on Express.js backend", async (t) => {
  const { server } = await startServer({ host: "127.0.0.1", port: 0 });
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const health = await request(baseUrl, "GET", "/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.data.runtime, "node.js");

  const productsResponse = await request(baseUrl, "GET", "/api/products");
  assert.equal(productsResponse.response.status, 200);
  assert.ok(productsResponse.data.length >= 4);
  const productImage = await fetch(`${baseUrl}/static/products/tuna-premium.png`);
  assert.equal(productImage.status, 200);
  assert.equal(productImage.headers.get("content-type"), "image/png");
  const filteredCatalog = await request(baseUrl, "GET", "/api/products?q=tuna&in_stock=true&sort=price_asc");
  assert.equal(filteredCatalog.response.status, 200);
  assert.ok(filteredCatalog.data.some((product) => product.name.includes("Tuna")));
  const productA = productsResponse.data[0];
  const productB = productsResponse.data[1];
  const otherStoreProduct = productsResponse.data.find((product) => product.store.id !== productA.store.id);
  const storeDetail = await request(baseUrl, "GET", `/api/stores/${productA.store.id}`);
  assert.equal(storeDetail.response.status, 200);
  assert.ok(storeDetail.data.product_count >= 1);

  const review = await request(baseUrl, "POST", "/api/reviews", {
    reviewer_name: "Security Tester",
    rating: 5,
    comment: "<script>alert('xss')</script>",
  });
  assert.equal(review.response.status, 201, review.data.detail);
  assert.match(review.data.review.comment, /&lt;script&gt;/);

  const sqlLogin = await request(baseUrl, "POST", "/api/auth/login", {
    username: "admin' OR '1'='1",
    password: "anything",
  });
  assert.equal(sqlLogin.response.status, 401);

  const multiLogin = await request(baseUrl, "POST", "/api/auth/login", { username: "multi", password: "Multi123" });
  assert.equal(multiLogin.response.status, 200);
  assert.equal(multiLogin.data.needs_role_selection, true);

  const buyerHeaders = await authHeaders(baseUrl, "buyer", "Buyer123", "Buyer");
  assert.equal((await request(baseUrl, "GET", "/api/seller/store", undefined, buyerHeaders)).response.status, 403);
  assert.equal((await request(baseUrl, "GET", "/api/admin/dashboard", undefined, buyerHeaders)).response.status, 403);

  const addCart = await request(baseUrl, "POST", "/api/buyer/cart/items", { product_id: productA.id, quantity: 1 }, buyerHeaders);
  assert.equal(addCart.response.status, 201, addCart.data.detail);
  const crossStore = await request(baseUrl, "POST", "/api/buyer/cart/items", { product_id: otherStoreProduct.id, quantity: 1 }, buyerHeaders);
  assert.equal(crossStore.response.status, 400);
  assert.match(crossStore.data.detail, /Single-store checkout/);

  const addresses = await request(baseUrl, "GET", "/api/buyer/addresses", undefined, buyerHeaders);
  const addressId = addresses.data[0].id;
  const summary = await request(baseUrl, "POST", "/api/buyer/checkout/summary", {
    address_id: addressId,
    delivery_method: "Regular",
    discount_code: "HEMAT25",
  }, buyerHeaders);
  assert.equal(summary.response.status, 200, summary.data.detail);
  assert.equal(summary.data.discount_type, "Voucher");
  assert.equal(summary.data.ppn_rate, 0.12);

  const checkout = await request(baseUrl, "POST", "/api/buyer/checkout", {
    address_id: addressId,
    delivery_method: "Regular",
    discount_code: "HEMAT25",
  }, buyerHeaders);
  assert.equal(checkout.response.status, 200, checkout.data.detail);
  const orderId = checkout.data.order.id;
  assert.equal(checkout.data.order.status, "Sedang Dikemas");
  const buyerNotificationsAfterCheckout = await request(baseUrl, "GET", "/api/notifications", undefined, buyerHeaders);
  assert.ok(buyerNotificationsAfterCheckout.data.items.some((item) => item.title.includes("Checkout")));

  const sellerHeaders = await authHeaders(baseUrl, "seller", "Seller123", "Seller");
  const sellerNotificationsAfterCheckout = await request(baseUrl, "GET", "/api/notifications", undefined, sellerHeaders);
  assert.ok(sellerNotificationsAfterCheckout.data.items.some((item) => item.title.includes("Order baru")));
  const sellerOrders = await request(baseUrl, "GET", "/api/seller/orders", undefined, sellerHeaders);
  assert.ok(sellerOrders.data.some((order) => order.id === orderId));
  const processed = await request(baseUrl, "POST", `/api/seller/orders/${orderId}/process`, undefined, sellerHeaders);
  assert.equal(processed.response.status, 200, processed.data.detail);
  assert.equal(processed.data.status, "Menunggu Pengirim");

  const driverHeaders = await authHeaders(baseUrl, "driver", "Driver123", "Driver");
  const driverNotifications = await request(baseUrl, "GET", "/api/notifications", undefined, driverHeaders);
  assert.ok(driverNotifications.data.items.some((item) => item.title.includes("Job baru")));
  const jobs = await request(baseUrl, "GET", "/api/driver/jobs/available", undefined, driverHeaders);
  const jobId = jobs.data.find((job) => job.order.id === orderId).job_id;
  assert.equal((await request(baseUrl, "GET", `/api/driver/jobs/${jobId}`, undefined, driverHeaders)).response.status, 200);
  const taken = await request(baseUrl, "POST", `/api/driver/jobs/${jobId}/take`, undefined, driverHeaders);
  assert.equal(taken.data.order.status, "Sedang Dikirim");
  const completed = await request(baseUrl, "POST", `/api/driver/jobs/${jobId}/complete`, undefined, driverHeaders);
  assert.equal(completed.data.order.status, "Pesanan Selesai");
  assert.ok(completed.data.earning > 0);

  const buyerOrderDetail = await request(baseUrl, "GET", `/api/buyer/orders/${orderId}`, undefined, buyerHeaders);
  assert.equal(buyerOrderDetail.data.status, "Pesanan Selesai");

  const secondCart = await request(baseUrl, "POST", "/api/buyer/cart/items", { product_id: productB.id, quantity: 1 }, buyerHeaders);
  assert.equal(secondCart.response.status, 201, secondCart.data.detail);
  const secondCheckout = await request(baseUrl, "POST", "/api/buyer/checkout", {
    address_id: addressId,
    delivery_method: "Instant",
    discount_code: null,
  }, buyerHeaders);
  assert.equal(secondCheckout.response.status, 200, secondCheckout.data.detail);
  const overdueOrderId = secondCheckout.data.order.id;

  const adminHeaders = await authHeaders(baseUrl, "admin", "Admin123", "Admin");
  const analyticsBeforeOverdue = await request(baseUrl, "GET", "/api/admin/analytics", undefined, adminHeaders);
  assert.equal(analyticsBeforeOverdue.response.status, 200);
  assert.ok(analyticsBeforeOverdue.data.gross_merchandise_value > 0);
  assert.equal((await request(baseUrl, "GET", "/api/admin/products", undefined, adminHeaders)).response.status, 200);
  const deliveryJobs = await request(baseUrl, "GET", "/api/admin/delivery-jobs", undefined, adminHeaders);
  assert.ok(deliveryJobs.data.some((job) => job.job_id === jobId));
  const vouchers = await request(baseUrl, "GET", "/api/admin/vouchers", undefined, adminHeaders);
  const voucherDetail = await request(baseUrl, "GET", `/api/admin/vouchers/${vouchers.data[0].id}`, undefined, adminHeaders);
  assert.equal(voucherDetail.data.discount_type, "Voucher");
  const promos = await request(baseUrl, "GET", "/api/admin/promos", undefined, adminHeaders);
  const promoDetail = await request(baseUrl, "GET", `/api/admin/promos/${promos.data[0].id}`, undefined, adminHeaders);
  assert.equal(promoDetail.data.discount_type, "Promo");

  const handled = [];
  for (let i = 0; i < 2; i += 1) {
    const simulated = await request(baseUrl, "POST", "/api/admin/simulate-next-day", undefined, adminHeaders);
    assert.equal(simulated.response.status, 200, simulated.data.detail);
    handled.push(...simulated.data.overdue_handled);
  }
  assert.ok(handled.includes(overdueOrderId));
  const refunded = await request(baseUrl, "GET", `/api/buyer/orders/${overdueOrderId}`, undefined, buyerHeaders);
  assert.equal(refunded.data.status, "Dikembalikan");
  assert.equal(refunded.data.is_refunded, true);
  const wallet = await request(baseUrl, "GET", "/api/buyer/wallet", undefined, buyerHeaders);
  assert.ok(wallet.data.transactions.some((tx) => tx.kind === "REFUND" && tx.note.includes(`order #${overdueOrderId}`)));
  const auditLogs = await request(baseUrl, "GET", "/api/admin/audit-logs", undefined, adminHeaders);
  assert.equal(auditLogs.response.status, 200);
  assert.ok(auditLogs.data.some((log) => log.action === "CHECKOUT"));
  assert.ok(auditLogs.data.some((log) => log.action === "AUTO_REFUND_OVERDUE"));
});
