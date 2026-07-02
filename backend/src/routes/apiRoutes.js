const express = require("express");

const { createApiController } = require("../controllers/apiController");

const routes = [
  ["get", "/health"],
  ["get", "/openapi.json"],

  ["post", "/api/auth/register"],
  ["post", "/api/auth/login"],
  ["post", "/api/auth/choose-role"],
  ["post", "/api/auth/logout"],
  ["get", "/api/me"],

  ["get", "/api/notifications"],
  ["post", "/api/notifications/read-all"],

  ["get", "/api/products"],
  ["get", "/api/products/:product_id"],
  ["get", "/api/stores/:store_id"],
  ["get", "/api/reviews"],
  ["post", "/api/reviews"],

  ["get", "/api/seller/store"],
  ["post", "/api/seller/store"],
  ["get", "/api/seller/products"],
  ["post", "/api/seller/products"],
  ["put", "/api/seller/products/:product_id"],
  ["delete", "/api/seller/products/:product_id"],
  ["get", "/api/seller/orders"],
  ["post", "/api/seller/orders/:order_id/process"],
  ["get", "/api/seller/report"],

  ["get", "/api/buyer/wallet"],
  ["post", "/api/buyer/wallet/topup"],
  ["get", "/api/buyer/addresses"],
  ["post", "/api/buyer/addresses"],
  ["get", "/api/buyer/cart"],
  ["post", "/api/buyer/cart/items"],
  ["patch", "/api/buyer/cart/items/:cart_item_id"],
  ["delete", "/api/buyer/cart/items/:cart_item_id"],
  ["delete", "/api/buyer/cart"],
  ["post", "/api/buyer/checkout/summary"],
  ["post", "/api/buyer/checkout"],
  ["get", "/api/buyer/orders"],
  ["get", "/api/buyer/orders/:order_id"],
  ["get", "/api/buyer/report"],

  ["get", "/api/driver/jobs/available"],
  ["get", "/api/driver/dashboard"],
  ["get", "/api/driver/jobs/:job_id"],
  ["post", "/api/driver/jobs/:job_id/take"],
  ["post", "/api/driver/jobs/:job_id/complete"],

  ["get", "/api/admin/dashboard"],
  ["get", "/api/admin/analytics"],
  ["get", "/api/admin/audit-logs"],
  ["get", "/api/admin/users"],
  ["get", "/api/admin/stores"],
  ["get", "/api/admin/products"],
  ["get", "/api/admin/orders"],
  ["get", "/api/admin/delivery-jobs"],
  ["get", "/api/admin/vouchers"],
  ["get", "/api/admin/vouchers/:voucher_id"],
  ["post", "/api/admin/vouchers"],
  ["get", "/api/admin/promos"],
  ["get", "/api/admin/promos/:promo_id"],
  ["post", "/api/admin/promos"],
  ["post", "/api/admin/simulate-next-day"],
  ["post", "/api/admin/run-overdue-check"],
];

function createApiRoutes(state) {
  const router = express.Router();
  const apiController = createApiController(state);

  for (const [method, path] of routes) {
    router[method](path, apiController);
  }

  return router;
}

module.exports = { createApiRoutes, routes };
