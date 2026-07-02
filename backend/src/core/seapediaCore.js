const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const APP_NAME = "SEAPEDIA";
const BASE_DIR = path.resolve(__dirname, "../../..");
const LEGACY_STATIC_DIR = path.join(BASE_DIR, "app", "static");
const FRONTEND_DIST_DIR = path.join(BASE_DIR, "frontend", "dist");
const DATA_FILE = process.env.SEAPEDIA_DATA_FILE || path.join(BASE_DIR, "seapedia-data.json");
const SECRET_KEY = process.env.SEAPEDIA_SECRET_KEY || "change-this-secret-in-production";
const TOKEN_EXPIRE_MINUTES = Number(process.env.SEAPEDIA_TOKEN_EXPIRE_MINUTES || 480);
const PPN_RATE = 0.12;
const DELIVERY_FEES = { Instant: 25000, "Next Day": 15000, Regular: 10000 };
const DELIVERY_SLA_DAYS = { Instant: 1, "Next Day": 2, Regular: 4 };
const DRIVER_EARNING_RATE = 0.8;
const MAIN_STATUSES = ["Sedang Dikemas", "Menunggu Pengirim", "Sedang Dikirim", "Pesanan Selesai", "Dikembalikan"];
const VALID_ROLES = new Set(["Admin", "Seller", "Buyer", "Driver"]);
const NON_ADMIN_ROLES = new Set(["Seller", "Buyer", "Driver"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function utcNow() {
  return new Date().toISOString();
}

function simulatedNow(state) {
  return new Date(Date.now() + Number(state.dayOffset || 0) * DAY_MS).toISOString();
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function escapeHtml(value) {
  return String(value ?? "")
    .trim()
    .replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
}

function assertCondition(condition, status, detail) {
  if (!condition) {
    const error = new Error(detail);
    error.status = status;
    throw error;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const digest = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256");
  return `${salt.toString("base64")}$${digest.toString("base64")}`;
}

function verifyPassword(password, passwordHash) {
  try {
    const [saltB64, digestB64] = String(passwordHash).split("$");
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(digestB64, "base64");
    const got = crypto.pbkdf2Sync(String(password), salt, 120000, expected.length, "sha256");
    return crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRE_MINUTES * 60,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = crypto.createHmac("sha256", SECRET_KEY).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

function verifyJwt(token) {
  try {
    const parts = String(token || "").split(".");
    assertCondition(parts.length === 3, 401, "Token tidak valid");
    const [headerB64, bodyB64, signature] = parts;
    const signingInput = `${headerB64}.${bodyB64}`;
    const expected = crypto.createHmac("sha256", SECRET_KEY).update(signingInput).digest("base64url");
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    assertCondition(signatureBuffer.length === expectedBuffer.length, 401, "Token tidak valid");
    assertCondition(crypto.timingSafeEqual(signatureBuffer, expectedBuffer), 401, "Token tidak valid");
    const payload = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"));
    assertCondition(!payload.exp || payload.exp >= Math.floor(Date.now() / 1000), 401, "Token sudah kedaluwarsa");
    return payload;
  } catch (error) {
    if (error.status) throw error;
    assertCondition(false, 401, "Token tidak valid");
  }
}

function createToken(user, activeRole = null) {
  return signJwt({ sub: String(user.id), roles: user.roles, active_role: activeRole });
}

function nextId(state, key) {
  state.nextIds[key] = Number(state.nextIds[key] || 1);
  const id = state.nextIds[key];
  state.nextIds[key] += 1;
  return id;
}

function defaultState() {
  return {
    dayOffset: 0,
    nextIds: {
      users: 1,
      stores: 1,
      products: 1,
      reviews: 1,
      walletTransactions: 1,
      addresses: 1,
      cartItems: 1,
      vouchers: 1,
      promos: 1,
      orders: 1,
      deliveryJobs: 1,
      auditLogs: 1,
      notifications: 1,
    },
    users: [],
    stores: [],
    products: [],
    reviews: [],
    walletTransactions: [],
    addresses: [],
    cartItems: [],
    vouchers: [],
    promos: [],
    orders: [],
    deliveryJobs: [],
    auditLogs: [],
    notifications: [],
  };
}

function createUser(state, username, email, password, roles) {
  const user = {
    id: nextId(state, "users"),
    username,
    email,
    password_hash: hashPassword(password),
    roles,
    created_at: utcNow(),
  };
  state.users.push(user);
  return user;
}

function seedState() {
  const state = defaultState();
  const admin = createUser(state, "admin", "admin@seapedia.id", "Admin123", ["Admin"]);
  const seller = createUser(state, "seller", "seller@seapedia.id", "Seller123", ["Seller"]);
  const buyer = createUser(state, "buyer", "buyer@seapedia.id", "Buyer123", ["Buyer"]);
  const driver = createUser(state, "driver", "driver@seapedia.id", "Driver123", ["Driver"]);
  const multi = createUser(state, "multi", "multi@seapedia.id", "Multi123", ["Buyer", "Seller", "Driver"]);
  void admin;
  void driver;

  const tokoLaut = {
    id: nextId(state, "stores"),
    seller_id: seller.id,
    name: "Toko Laut Nusantara",
    description: "Produk laut segar dan perlengkapan dapur pilihan.",
    created_at: utcNow(),
  };
  const tokoMulti = {
    id: nextId(state, "stores"),
    seller_id: multi.id,
    name: "Multi Mart Bahari",
    description: "Toko kebutuhan rumah tangga dan pengiriman harian.",
    created_at: utcNow(),
  };
  state.stores.push(tokoLaut, tokoMulti);

  state.products.push(
    { id: nextId(state, "products"), store_id: tokoLaut.id, name: "Paket Ikan Tuna Premium", description: "Tuna fillet beku kualitas restoran.", price: 85000, stock: 25, created_at: utcNow() },
    { id: nextId(state, "products"), store_id: tokoLaut.id, name: "Udang Vaname 1 Kg", description: "Udang vaname segar siap masak.", price: 95000, stock: 18, created_at: utcNow() },
    { id: nextId(state, "products"), store_id: tokoMulti.id, name: "Keranjang Belanja Lipat", description: "Keranjang kokoh untuk belanja mingguan.", price: 45000, stock: 40, created_at: utcNow() },
    { id: nextId(state, "products"), store_id: tokoMulti.id, name: "Cooler Box Mini", description: "Kotak pendingin praktis untuk pengiriman cepat.", price: 125000, stock: 10, created_at: utcNow() },
  );

  state.reviews.push(
    { id: nextId(state, "reviews"), reviewer_name: "Alya", rating: 5, comment: "Mudah dipakai dan alurnya jelas.", created_at: utcNow() },
    { id: nextId(state, "reviews"), reviewer_name: "Rizky", rating: 4, comment: "Marketplace multi-role ini terasa lengkap untuk operasional harian.", created_at: utcNow() },
  );

  state.walletTransactions.push(
    { id: nextId(state, "walletTransactions"), buyer_id: buyer.id, kind: "TOPUP", amount: 1000000, note: "Saldo awal buyer", created_at: utcNow() },
    { id: nextId(state, "walletTransactions"), buyer_id: multi.id, kind: "TOPUP", amount: 750000, note: "Saldo awal multi-role", created_at: utcNow() },
  );

  state.addresses.push(
    { id: nextId(state, "addresses"), buyer_id: buyer.id, recipient_name: "Budi Santoso", phone: "081234567890", full_address: "Jl. Samudra Raya No. 18, Jakarta", created_at: utcNow() },
    { id: nextId(state, "addresses"), buyer_id: multi.id, recipient_name: "Maya Lestari", phone: "081298765432", full_address: "Jl. Bahari Indah No. 7, Depok", created_at: utcNow() },
  );

  state.vouchers.push({
    id: nextId(state, "vouchers"),
    code: "HEMAT25",
    value: 25000,
    expiry_date: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    remaining_usage: 20,
    created_at: utcNow(),
  });
  state.promos.push({
    id: nextId(state, "promos"),
    code: "PROMO10",
    percent: 10,
    expiry_date: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    created_at: utcNow(),
  });

  return state;
}

function loadState() {
  if (!fs.existsSync(DATA_FILE)) {
    const state = seedState();
    saveState(state);
    return state;
  }
  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  state.dayOffset = Number(state.dayOffset || 0);
  state.nextIds = { ...defaultState().nextIds, ...(state.nextIds || {}) };
  for (const key of ["users", "stores", "products", "reviews", "walletTransactions", "addresses", "cartItems", "vouchers", "promos", "orders", "deliveryJobs", "auditLogs", "notifications"]) {
    state[key] = Array.isArray(state[key]) ? state[key] : [];
  }
  if (state.users.length === 0) {
    const seeded = seedState();
    saveState(seeded);
    return seeded;
  }
  return state;
}

function saveState(state) {
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function actorFromUser(user, activeRole = null) {
  if (!user) return { user_id: null, username: "system", active_role: "System" };
  return { user_id: user.id, username: user.username, active_role: activeRole };
}

function auditLog(state, actor, action, entityType, entityId = null, details = {}) {
  state.auditLogs.push({
    id: nextId(state, "auditLogs"),
    actor: actor || actorFromUser(null),
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
    created_at: simulatedNow(state),
  });
  if (state.auditLogs.length > 700) state.auditLogs = state.auditLogs.slice(-700);
}

function notifyUser(state, userId, role, title, message, href = "#/dashboard", kind = "info") {
  if (!userId || !role) return;
  state.notifications.push({
    id: nextId(state, "notifications"),
    user_id: Number(userId),
    role,
    title: escapeHtml(title),
    message: escapeHtml(message),
    href,
    kind,
    read: false,
    created_at: simulatedNow(state),
  });
  if (state.notifications.length > 1000) state.notifications = state.notifications.slice(-1000);
}

function notifyRoleOwners(state, role, title, message, href = "#/dashboard", kind = "info") {
  for (const user of state.users.filter((candidate) => candidate.roles.includes(role))) {
    notifyUser(state, user.id, role, title, message, href, kind);
  }
}

function getUser(state, id) {
  return state.users.find((u) => u.id === Number(id));
}

function getStore(state, id) {
  return state.stores.find((s) => s.id === Number(id));
}

function getProduct(state, id) {
  return state.products.find((p) => p.id === Number(id));
}

function getOrder(state, id) {
  return state.orders.find((o) => o.id === Number(id));
}

function getDeliveryJob(state, id) {
  return state.deliveryJobs.find((j) => j.id === Number(id));
}

function currentUser(req, state) {
  const auth = req.headers.authorization || "";
  assertCondition(auth.startsWith("Bearer "), 401, "Login diperlukan");
  const payload = verifyJwt(auth.replace("Bearer ", "").trim());
  const user = getUser(state, payload.sub);
  assertCondition(user, 401, "User tidak ditemukan");
  return { user, activeRole: payload.active_role || null };
}

function requireRole(req, state, role) {
  const current = currentUser(req, state);
  assertCondition(current.activeRole === role, 403, `Akses memerlukan active role ${role}`);
  assertCondition(current.user.roles.includes(role), 403, "Role tidak dimiliki user");
  return current.user;
}

function userDict(user, activeRole = null) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    roles: user.roles,
    active_role: activeRole,
    created_at: user.created_at,
  };
}

function productPublicDict(state, product) {
  const store = getStore(state, product.store_id);
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    stock: product.stock,
    store: store ? { id: store.id, name: store.name, description: store.description } : null,
    created_at: product.created_at,
  };
}

function catalogProducts(state, searchParams = new URLSearchParams()) {
  const q = String(searchParams.get("q") || "").trim().toLowerCase();
  const storeId = Number(searchParams.get("store_id") || 0);
  const minPrice = Number(searchParams.get("min_price") || 0);
  const maxPrice = Number(searchParams.get("max_price") || 0);
  const inStockOnly = searchParams.get("in_stock") === "true";
  const sort = searchParams.get("sort") || "oldest";
  let products = [...state.products];

  if (q) {
    products = products.filter((product) => {
      const store = getStore(state, product.store_id);
      return [product.name, product.description, store?.name].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }
  if (storeId) products = products.filter((product) => product.store_id === storeId);
  if (minPrice > 0) products = products.filter((product) => Number(product.price) >= minPrice);
  if (maxPrice > 0) products = products.filter((product) => Number(product.price) <= maxPrice);
  if (inStockOnly) products = products.filter((product) => Number(product.stock) > 0);

  const sorters = {
    newest: (a, b) => b.id - a.id,
    oldest: (a, b) => a.id - b.id,
    price_asc: (a, b) => a.price - b.price,
    price_desc: (a, b) => b.price - a.price,
    stock_desc: (a, b) => b.stock - a.stock,
    name_asc: (a, b) => a.name.localeCompare(b.name),
  };
  products.sort(sorters[sort] || sorters.newest);
  return products.map((product) => productPublicDict(state, product));
}

function orderDict(order) {
  return {
    id: order.id,
    buyer_id: order.buyer_id,
    store_id: order.store_id,
    seller_id: order.seller_id,
    address_snapshot: order.address_snapshot,
    delivery_method: order.delivery_method,
    subtotal: order.subtotal,
    discount: order.discount,
    discount_code: order.discount_code,
    discount_type: order.discount_type,
    delivery_fee: order.delivery_fee,
    ppn: order.ppn,
    final_total: order.final_total,
    status: order.status,
    driver_id: order.driver_id,
    driver_earning: order.driver_earning,
    is_refunded: order.is_refunded,
    created_at: order.created_at,
    completed_at: order.completed_at,
    items: order.items || [],
    history: [...(order.history || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
  };
}

function voucherDict(voucher) {
  return {
    id: voucher.id,
    code: voucher.code,
    value: voucher.value,
    expiry_date: voucher.expiry_date,
    remaining_usage: voucher.remaining_usage,
    created_at: voucher.created_at,
    discount_type: "Voucher",
    rule: "Voucher adalah potongan nominal, memiliki expiry date, dan remaining usage berkurang setelah checkout berhasil.",
  };
}

function promoDict(promo) {
  return {
    id: promo.id,
    code: promo.code,
    percent: promo.percent,
    expiry_date: promo.expiry_date,
    created_at: promo.created_at,
    discount_type: "Promo",
    rule: "Promo adalah potongan persentase dan memiliki expiry date.",
  };
}

function deliveryJobDict(state, job) {
  const order = getOrder(state, job.order_id);
  return {
    job_id: job.id,
    order: order ? orderDict(order) : null,
    driver_id: job.driver_id,
    status: job.status,
    created_at: job.created_at,
    taken_at: job.taken_at,
    completed_at: job.completed_at,
  };
}

function walletBalance(state, buyerId) {
  return state.walletTransactions
    .filter((tx) => tx.buyer_id === Number(buyerId))
    .reduce((total, tx) => total + Number(tx.amount), 0);
}

function adminAnalytics(state) {
  const paidOrders = state.orders.filter((order) => !order.is_refunded);
  const completedOrders = state.orders.filter((order) => order.status === "Pesanan Selesai");
  const returnedOrders = state.orders.filter((order) => order.status === "Dikembalikan");
  const activeOrders = state.orders.filter((order) => ["Sedang Dikemas", "Menunggu Pengirim", "Sedang Dikirim"].includes(order.status));
  const sellerIncome = completedOrders.reduce((total, order) => total + order.subtotal - order.discount, 0);
  const driverEarnings = completedOrders.reduce((total, order) => total + Number(order.driver_earning || 0), 0);
  const storePerformance = state.stores.map((store) => {
    const orders = state.orders.filter((order) => order.store_id === store.id);
    const completed = orders.filter((order) => order.status === "Pesanan Selesai");
    return {
      store_id: store.id,
      store_name: store.name,
      product_count: state.products.filter((product) => product.store_id === store.id).length,
      completed_orders: completed.length,
      income: completed.reduce((total, order) => total + order.subtotal - order.discount, 0),
    };
  }).sort((a, b) => b.income - a.income);
  return {
    generated_at: simulatedNow(state),
    gross_merchandise_value: paidOrders.reduce((total, order) => total + order.final_total, 0),
    completed_gmv: completedOrders.reduce((total, order) => total + order.final_total, 0),
    refunded_total: returnedOrders.reduce((total, order) => total + order.final_total, 0),
    discount_total: state.orders.reduce((total, order) => total + Number(order.discount || 0), 0),
    ppn_total: paidOrders.reduce((total, order) => total + Number(order.ppn || 0), 0),
    seller_income: sellerIncome,
    driver_earnings: driverEarnings,
    active_orders: activeOrders.length,
    overdue_orders: findOverdueOrders(state).length,
    active_carts: new Set(state.cartItems.map((item) => item.buyer_id)).size,
    average_order_value: paidOrders.length ? roundMoney(paidOrders.reduce((total, order) => total + order.final_total, 0) / paidOrders.length) : 0,
    low_stock_products: state.products.filter((product) => product.stock <= 5).map((product) => productPublicDict(state, product)),
    store_performance: storePerformance,
  };
}

function setStatus(state, order, status, note = "") {
  order.status = status;
  order.history = order.history || [];
  order.history.push({ status, note: escapeHtml(note), created_at: simulatedNow(state) });
}

function cartSummaryForBuyer(state, buyerId) {
  const cartItems = state.cartItems.filter((item) => item.buyer_id === Number(buyerId));
  let subtotal = 0;
  let storeId = null;
  let storeName = null;
  const items = [];
  for (const item of cartItems) {
    const product = getProduct(state, item.product_id);
    if (!product) continue;
    const store = getStore(state, product.store_id);
    const lineTotal = Number(product.price) * Number(item.quantity);
    subtotal += lineTotal;
    storeId = product.store_id;
    storeName = store?.name || null;
    items.push({
      cart_item_id: item.id,
      product_id: product.id,
      product_name: product.name,
      quantity: item.quantity,
      price: product.price,
      line_total: lineTotal,
      stock: product.stock,
      store_id: product.store_id,
      store_name: store?.name || null,
    });
  }
  return { items, subtotal, store_id: storeId, store_name: storeName };
}

function validateDiscount(state, code, subtotal) {
  if (!code) return { discount: 0, code: null, type: null };
  const normalized = String(code).trim().toUpperCase();
  const nowMs = new Date(simulatedNow(state)).getTime();
  const voucher = state.vouchers.find((v) => v.code === normalized);
  if (voucher) {
    assertCondition(new Date(voucher.expiry_date).getTime() >= nowMs, 400, "Voucher sudah kedaluwarsa");
    assertCondition(Number(voucher.remaining_usage) > 0, 400, "Voucher sudah habis digunakan");
    return { discount: Math.min(Number(voucher.value), subtotal), code: voucher.code, type: "Voucher" };
  }
  const promo = state.promos.find((p) => p.code === normalized);
  if (promo) {
    assertCondition(new Date(promo.expiry_date).getTime() >= nowMs, 400, "Promo sudah kedaluwarsa");
    return { discount: Math.min(subtotal * (Number(promo.percent) / 100), subtotal), code: promo.code, type: "Promo" };
  }
  assertCondition(false, 400, "Kode diskon tidak ditemukan");
}

function buildCheckoutSummary(state, buyerId, deliveryMethod, discountCode) {
  assertCondition(Object.hasOwn(DELIVERY_FEES, deliveryMethod), 400, "Metode pengiriman harus Instant, Next Day, atau Regular");
  const cart = cartSummaryForBuyer(state, buyerId);
  assertCondition(cart.items.length > 0, 400, "Cart masih kosong");
  const discountResult = validateDiscount(state, discountCode, cart.subtotal);
  const taxBase = cart.subtotal - discountResult.discount;
  const ppn = roundMoney(taxBase * PPN_RATE);
  const deliveryFee = DELIVERY_FEES[deliveryMethod];
  const finalTotal = roundMoney(taxBase + ppn + deliveryFee);
  return {
    items: cart.items,
    store_id: cart.store_id,
    store_name: cart.store_name,
    subtotal: cart.subtotal,
    discount: discountResult.discount,
    discount_code: discountResult.code,
    discount_type: discountResult.type,
    delivery_method: deliveryMethod,
    delivery_fee: deliveryFee,
    ppn_rate: PPN_RATE,
    ppn,
    final_total: finalTotal,
    discount_rule: "Satu checkout hanya menerima satu kode. Voucher bernilai potongan nominal dan mengurangi remaining_usage. Promo bernilai persentase.",
    ppn_rule: "PPN 12% dihitung setelah diskon dan sebelum biaya pengiriman ditambahkan ke total akhir.",
  };
}

function findOverdueOrders(state) {
  const nowMs = new Date(simulatedNow(state)).getTime();
  return state.orders.filter((order) => {
    if (!["Sedang Dikemas", "Menunggu Pengirim", "Sedang Dikirim"].includes(order.status)) return false;
    if (order.is_refunded) return false;
    const slaDays = DELIVERY_SLA_DAYS[order.delivery_method];
    return new Date(order.created_at).getTime() + slaDays * DAY_MS < nowMs;
  });
}

function applyOverdueRefund(state, order, actor = null) {
  if (order.is_refunded || order.status === "Dikembalikan") return;
  order.is_refunded = true;
  state.walletTransactions.push({
    id: nextId(state, "walletTransactions"),
    buyer_id: order.buyer_id,
    kind: "REFUND",
    amount: order.final_total,
    note: `Auto refund order #${order.id} karena overdue`,
    created_at: simulatedNow(state),
  });
  for (const item of order.items || []) {
    const product = getProduct(state, item.product_id);
    if (product) product.stock += Number(item.quantity);
  }
  const job = state.deliveryJobs.find((deliveryJob) => deliveryJob.order_id === order.id);
  if (job && job.status !== "Completed") job.status = "Returned";
  setStatus(state, order, "Dikembalikan", `Auto return/refund karena melewati SLA ${order.delivery_method}`);
  notifyUser(state, order.buyer_id, "Buyer", "Order dikembalikan", `Order #${order.id} melewati SLA dan dana sudah dikembalikan.`, `#/orders/${order.id}`, "warning");
  notifyUser(state, order.seller_id, "Seller", "Order auto return", `Order #${order.id} dikembalikan karena overdue.`, "#/dashboard", "warning");
  if (order.driver_id) notifyUser(state, order.driver_id, "Driver", "Job returned", `Job order #${order.id} ditandai returned karena overdue.`, "#/dashboard", "warning");
  auditLog(state, actor || actorFromUser(null), "AUTO_REFUND_OVERDUE", "Order", order.id, { delivery_method: order.delivery_method, final_total: order.final_total });
}

function validateRegister(payload) {
  const username = String(payload.username || "").trim();
  assertCondition(username.length >= 3 && username.length <= 64, 422, "Username minimal 3 karakter");
  assertCondition(/^[A-Za-z0-9_.-]+$/.test(username), 422, "Username hanya boleh berisi huruf, angka, titik, underscore, atau tanda hubung");
  const email = String(payload.email || "").trim().toLowerCase();
  assertCondition(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 422, "Email tidak valid");
  const password = String(payload.password || "");
  assertCondition(password.length >= 6 && password.length <= 120, 422, "Password minimal 6 karakter");
  const roles = Array.isArray(payload.roles) ? [...new Set(payload.roles)] : ["Buyer"];
  assertCondition(roles.length > 0, 422, "Pilih minimal satu role");
  assertCondition(roles.every((role) => VALID_ROLES.has(role)), 422, "Role tidak valid");
  assertCondition(!(roles.includes("Admin") && roles.length > 1), 422, "Admin harus berdiri sendiri sebagai role khusus");
  return { username, email, password, roles };
}

function validateReview(payload) {
  const reviewerName = String(payload.reviewer_name || "").trim();
  const rating = Number(payload.rating);
  const comment = String(payload.comment || "").trim();
  assertCondition(reviewerName.length >= 2 && reviewerName.length <= 100, 422, "Nama reviewer harus 2-100 karakter");
  assertCondition(Number.isInteger(rating) && rating >= 1 && rating <= 5, 422, "Rating harus 1 sampai 5");
  assertCondition(comment.length >= 1 && comment.length <= 1000, 422, "Komentar harus 1-1000 karakter");
  return { reviewerName, rating, comment };
}

function validatePhone(phone) {
  assertCondition(/^[0-9+()\-\s]+$/.test(phone), 422, "Nomor telepon hanya boleh berisi angka dan simbol telepon standar");
}

function openApiDocument() {
  return {
    openapi: "3.0.0",
    info: { title: "SEAPEDIA Express.js API", version: "3.0.0" },
    paths: {
      "/api/auth/register": { post: { summary: "Register Buyer, Seller, or Driver account" } },
      "/api/auth/login": { post: { summary: "Login and receive JWT with active role" } },
      "/api/auth/choose-role": { post: { summary: "Choose active role for current token" } },
      "/api/me": { get: { summary: "Current user profile and role summaries" } },
      "/api/notifications": { get: { summary: "Role-aware notification list" } },
      "/api/products": { get: { summary: "Public product catalog with search, filter, and sort query params" } },
      "/api/products/{product_id}": { get: { summary: "Public product detail" } },
      "/api/stores/{store_id}": { get: { summary: "Public store detail and product list" } },
      "/api/reviews": { get: { summary: "Public feedback list" }, post: { summary: "Create public feedback" } },
      "/api/seller/store": { get: { summary: "Seller store profile" }, post: { summary: "Create or update Seller store" } },
      "/api/seller/products": { get: { summary: "Seller product list" }, post: { summary: "Create Seller product" } },
      "/api/buyer/checkout": { post: { summary: "Create order from cart" } },
      "/api/driver/jobs/available": { get: { summary: "Driver available jobs" } },
      "/api/admin/dashboard": { get: { summary: "Admin monitoring dashboard" } },
      "/api/admin/analytics": { get: { summary: "Admin operational analytics" } },
      "/api/admin/audit-logs": { get: { summary: "Admin audit log trail" } },
      "/api/admin/simulate-next-day": { post: { summary: "Advance simulated date and run overdue handling" } },
    },
  };
}

function docsHtml() {
  return `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SEAPEDIA API Docs</title><link rel="stylesheet" href="/static/app.css"></head>
<body><main class="container">
<section class="panel"><h1>SEAPEDIA Express.js API Documentation</h1><p class="muted">OpenAPI JSON tersedia di <a href="/openapi.json">/openapi.json</a>. Endpoint utama dipertahankan kompatibel dengan frontend.</p></section><br>
<section class="grid cols-2">
${Object.entries(openApiDocument().paths).map(([url, methods]) => `<article class="card"><h3>${url}</h3><p>${Object.keys(methods).map((method) => method.toUpperCase()).join(", ")}</p><p class="muted">${Object.values(methods)[0].summary}</p></article>`).join("")}
</section>
</main></body></html>`;
}

function send(res, status, data, headers = {}) {
  const isBuffer = Buffer.isBuffer(data);
  const body = isBuffer || typeof data === "string" ? data : JSON.stringify(data);
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...(isBuffer ? {} : { "Content-Type": typeof data === "string" ? "text/html; charset=utf-8" : "application/json; charset=utf-8" }),
    ...headers,
  });
  res.end(res.req?.method === "HEAD" ? undefined : body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(Object.assign(new Error("Payload terlalu besar"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("JSON tidak valid"), { status: 400 }));
      }
    });
  });
}

function frontendDir() {
  const indexPath = path.join(FRONTEND_DIST_DIR, "index.html");
  return fs.existsSync(indexPath) ? FRONTEND_DIST_DIR : LEGACY_STATIC_DIR;
}

function serveFile(res, rootDir, relative) {
  const filePath = path.join(rootDir, relative);
  const normalized = path.normalize(filePath);
  assertCondition(normalized === rootDir || normalized.startsWith(`${rootDir}${path.sep}`), 403, "Akses file tidak valid");
  assertCondition(fs.existsSync(normalized) && fs.statSync(normalized).isFile(), 404, "File tidak ditemukan");
  const ext = path.extname(normalized).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
  };
  send(res, 200, fs.readFileSync(normalized), { "Content-Type": contentTypes[ext] || "application/octet-stream" });
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith("/static/")) {
    return serveFile(res, LEGACY_STATIC_DIR, pathname.replace(/^\/static\//, ""));
  }
  const rootDir = frontendDir();
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  try {
    return serveFile(res, rootDir, relative);
  } catch (error) {
    if (error.status !== 404 || rootDir !== FRONTEND_DIST_DIR) throw error;
    return serveFile(res, rootDir, "index.html");
  }
}

async function apiHandler(req, res, state, pathname, url) {
  const method = req.method;
  const body = ["POST", "PUT", "PATCH"].includes(method)
    ? (Object.prototype.hasOwnProperty.call(req, "body") ? (req.body || {}) : await parseJsonBody(req))
    : {};
  let match;

  if (method === "GET" && pathname === "/health") {
    return send(res, 200, { status: "ok", app: APP_NAME, runtime: "node.js", framework: "express.js", simulated_now: simulatedNow(state) });
  }
  if (method === "GET" && pathname === "/openapi.json") {
    return send(res, 200, openApiDocument());
  }

  if (method === "POST" && pathname === "/api/auth/register") {
    const payload = validateRegister(body);
    assertCondition(!payload.roles.includes("Admin"), 403, "Admin dibuat melalui seed data atau setup khusus");
    assertCondition(!state.users.some((user) => user.username === payload.username), 400, "Username sudah digunakan");
    assertCondition(!state.users.some((user) => user.email === payload.email), 400, "Email sudah digunakan");
    const user = createUser(state, payload.username, payload.email, payload.password, payload.roles);
    const activeRole = payload.roles.length === 1 ? payload.roles[0] : null;
    auditLog(state, actorFromUser(user, activeRole), "REGISTER", "User", user.id, { roles: user.roles });
    saveState(state);
    return send(res, 200, {
      access_token: createToken(user, activeRole),
      token_type: "bearer",
      roles: user.roles,
      active_role: activeRole,
      needs_role_selection: activeRole === null,
    });
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    const username = String(body.username || "").trim();
    const user = state.users.find((candidate) => candidate.username === username);
    assertCondition(user && verifyPassword(body.password || "", user.password_hash), 401, "Username atau password salah");
    const activeRole = user.roles.length === 1 ? user.roles[0] : null;
    return send(res, 200, {
      access_token: createToken(user, activeRole),
      token_type: "bearer",
      roles: user.roles,
      active_role: activeRole,
      needs_role_selection: activeRole === null,
    });
  }

  if (method === "POST" && pathname === "/api/auth/choose-role") {
    const current = currentUser(req, state);
    const role = String(body.role || "");
    assertCondition(VALID_ROLES.has(role), 422, "Role tidak valid");
    assertCondition(current.user.roles.includes(role), 403, "Role tidak dimiliki user");
    return send(res, 200, {
      access_token: createToken(current.user, role),
      token_type: "bearer",
      roles: current.user.roles,
      active_role: role,
      needs_role_selection: false,
    });
  }

  if (method === "POST" && pathname === "/api/auth/logout") {
    return send(res, 200, { message: "Logout berhasil. Hapus token di client." });
  }

  if (method === "GET" && pathname === "/api/me") {
    const current = currentUser(req, state);
    const summary = { wallet_balance: null, seller_store: null, driver_completed_jobs: null };
    if (current.user.roles.includes("Buyer")) summary.wallet_balance = walletBalance(state, current.user.id);
    if (current.user.roles.includes("Seller")) {
      const store = state.stores.find((candidate) => candidate.seller_id === current.user.id);
      summary.seller_store = store ? { id: store.id, name: store.name } : null;
    }
    if (current.user.roles.includes("Driver")) {
      summary.driver_completed_jobs = state.deliveryJobs.filter((job) => job.driver_id === current.user.id && job.status === "Completed").length;
    }
    return send(res, 200, { ...userDict(current.user, current.activeRole), financial_summary_placeholder: summary });
  }

  if (method === "GET" && pathname === "/api/notifications") {
    const current = currentUser(req, state);
    assertCondition(current.activeRole, 403, "Pilih active role terlebih dahulu");
    const items = state.notifications
      .filter((notification) => notification.user_id === current.user.id && notification.role === current.activeRole)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20);
    return send(res, 200, { unread_count: items.filter((item) => !item.read).length, items });
  }

  if (method === "POST" && pathname === "/api/notifications/read-all") {
    const current = currentUser(req, state);
    assertCondition(current.activeRole, 403, "Pilih active role terlebih dahulu");
    for (const notification of state.notifications.filter((item) => item.user_id === current.user.id && item.role === current.activeRole)) {
      notification.read = true;
    }
    auditLog(state, actorFromUser(current.user, current.activeRole), "READ_NOTIFICATIONS", "Notification", null, { role: current.activeRole });
    saveState(state);
    return send(res, 200, { message: "Notifikasi ditandai sudah dibaca" });
  }

  if (method === "GET" && pathname === "/api/products") {
    return send(res, 200, catalogProducts(state, url.searchParams));
  }

  if (method === "GET" && (match = pathname.match(/^\/api\/products\/(\d+)$/))) {
    const product = getProduct(state, match[1]);
    assertCondition(product, 404, "Produk tidak ditemukan");
    return send(res, 200, productPublicDict(state, product));
  }

  if (method === "GET" && (match = pathname.match(/^\/api\/stores\/(\d+)$/))) {
    const store = getStore(state, match[1]);
    assertCondition(store, 404, "Store tidak ditemukan");
    return send(res, 200, {
      id: store.id,
      name: store.name,
      description: store.description,
      seller_id: store.seller_id,
      product_count: state.products.filter((product) => product.store_id === store.id).length,
      completed_orders: state.orders.filter((order) => order.store_id === store.id && order.status === "Pesanan Selesai").length,
      income: state.orders.filter((order) => order.store_id === store.id && order.status === "Pesanan Selesai").reduce((total, order) => total + order.subtotal - order.discount, 0),
      products: state.products.filter((product) => product.store_id === store.id).map((product) => productPublicDict(state, product)),
    });
  }

  if (method === "GET" && pathname === "/api/reviews") {
    return send(res, 200, [...state.reviews].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }

  if (method === "POST" && pathname === "/api/reviews") {
    const payload = validateReview(body);
    const review = {
      id: nextId(state, "reviews"),
      reviewer_name: escapeHtml(payload.reviewerName),
      rating: payload.rating,
      comment: escapeHtml(payload.comment),
      created_at: simulatedNow(state),
    };
    state.reviews.push(review);
    auditLog(state, actorFromUser(null), "CREATE_PUBLIC_REVIEW", "ApplicationReview", review.id, { rating: review.rating });
    saveState(state);
    return send(res, 201, { message: "Review aplikasi berhasil dikirim", review });
  }

  if (method === "GET" && pathname === "/api/seller/store") {
    const seller = requireRole(req, state, "Seller");
    const store = state.stores.find((candidate) => candidate.seller_id === seller.id);
    return send(res, 200, store || null);
  }

  if (method === "POST" && pathname === "/api/seller/store") {
    const seller = requireRole(req, state, "Seller");
    const name = escapeHtml(body.name || "");
    assertCondition(name.length >= 3 && name.length <= 120, 422, "Nama store harus 3-120 karakter");
    const description = escapeHtml(body.description || "");
    assertCondition(description.length <= 1000, 422, "Deskripsi maksimal 1000 karakter");
    assertCondition(!state.stores.some((store) => store.name === name && store.seller_id !== seller.id), 400, "Nama toko sudah digunakan");
    let store = state.stores.find((candidate) => candidate.seller_id === seller.id);
    if (!store) {
      store = { id: nextId(state, "stores"), seller_id: seller.id, name, description, created_at: simulatedNow(state) };
      state.stores.push(store);
      auditLog(state, actorFromUser(seller, "Seller"), "CREATE_STORE", "Store", store.id, { name: store.name });
    } else {
      store.name = name;
      store.description = description;
      auditLog(state, actorFromUser(seller, "Seller"), "UPDATE_STORE", "Store", store.id, { name: store.name });
    }
    saveState(state);
    return send(res, 200, { ...store, message: "Store tersimpan" });
  }

  if (method === "GET" && pathname === "/api/seller/products") {
    const seller = requireRole(req, state, "Seller");
    const store = state.stores.find((candidate) => candidate.seller_id === seller.id);
    return send(res, 200, store ? state.products.filter((product) => product.store_id === store.id).map((product) => productPublicDict(state, product)) : []);
  }

  if (method === "POST" && pathname === "/api/seller/products") {
    const seller = requireRole(req, state, "Seller");
    const store = state.stores.find((candidate) => candidate.seller_id === seller.id);
    assertCondition(store, 400, "Buat store terlebih dahulu");
    const product = {
      id: nextId(state, "products"),
      store_id: store.id,
      name: escapeHtml(body.name || ""),
      description: escapeHtml(body.description || ""),
      price: Number(body.price),
      stock: Number(body.stock),
      created_at: simulatedNow(state),
    };
    assertCondition(product.name.length >= 2 && product.name.length <= 150, 422, "Nama produk harus 2-150 karakter");
    assertCondition(Number.isFinite(product.price) && product.price > 0, 422, "Harga produk harus lebih dari 0");
    assertCondition(Number.isInteger(product.stock) && product.stock >= 0, 422, "Stok produk minimal 0");
    state.products.push(product);
    auditLog(state, actorFromUser(seller, "Seller"), "CREATE_PRODUCT", "Product", product.id, { store_id: store.id, price: product.price, stock: product.stock });
    saveState(state);
    return send(res, 201, productPublicDict(state, product));
  }

  if ((method === "PUT" || method === "DELETE") && (match = pathname.match(/^\/api\/seller\/products\/(\d+)$/))) {
    const seller = requireRole(req, state, "Seller");
    const store = state.stores.find((candidate) => candidate.seller_id === seller.id);
    const product = getProduct(state, match[1]);
    assertCondition(store && product && product.store_id === store.id, 404, "Produk tidak ditemukan atau bukan milik Seller ini");
    if (method === "DELETE") {
      state.products = state.products.filter((candidate) => candidate.id !== product.id);
      auditLog(state, actorFromUser(seller, "Seller"), "DELETE_PRODUCT", "Product", product.id, { store_id: store.id });
      saveState(state);
      return send(res, 200, { message: "Produk dihapus" });
    }
    product.name = escapeHtml(body.name || "");
    product.description = escapeHtml(body.description || "");
    product.price = Number(body.price);
    product.stock = Number(body.stock);
    assertCondition(product.name.length >= 2 && product.name.length <= 150, 422, "Nama produk harus 2-150 karakter");
    assertCondition(Number.isFinite(product.price) && product.price > 0, 422, "Harga produk harus lebih dari 0");
    assertCondition(Number.isInteger(product.stock) && product.stock >= 0, 422, "Stok produk minimal 0");
    auditLog(state, actorFromUser(seller, "Seller"), "UPDATE_PRODUCT", "Product", product.id, { price: product.price, stock: product.stock });
    saveState(state);
    return send(res, 200, productPublicDict(state, product));
  }

  if (method === "GET" && pathname === "/api/seller/orders") {
    const seller = requireRole(req, state, "Seller");
    return send(res, 200, state.orders.filter((order) => order.seller_id === seller.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(orderDict));
  }

  if (method === "POST" && (match = pathname.match(/^\/api\/seller\/orders\/(\d+)\/process$/))) {
    const seller = requireRole(req, state, "Seller");
    const order = getOrder(state, match[1]);
    assertCondition(order && order.seller_id === seller.id, 404, "Order tidak ditemukan untuk Seller ini");
    assertCondition(order.status === "Sedang Dikemas", 400, "Hanya order Sedang Dikemas yang dapat diproses");
    setStatus(state, order, "Menunggu Pengirim", "Seller memproses order dan menunggu Driver");
    if (!state.deliveryJobs.some((job) => job.order_id === order.id)) {
      state.deliveryJobs.push({ id: nextId(state, "deliveryJobs"), order_id: order.id, driver_id: null, status: "Available", created_at: simulatedNow(state), taken_at: null, completed_at: null });
    }
    notifyUser(state, order.buyer_id, "Buyer", "Order siap dikirim", `Order #${order.id} sudah diproses seller dan menunggu driver.`, `#/orders/${order.id}`, "success");
    notifyRoleOwners(state, "Driver", "Job baru tersedia", `Order #${order.id} sudah siap diambil.`, "#/dashboard", "info");
    auditLog(state, actorFromUser(seller, "Seller"), "PROCESS_ORDER", "Order", order.id, { status: order.status });
    saveState(state);
    return send(res, 200, orderDict(order));
  }

  if (method === "GET" && pathname === "/api/seller/report") {
    const seller = requireRole(req, state, "Seller");
    const orders = state.orders.filter((order) => order.seller_id === seller.id);
    const completed = orders.filter((order) => order.status === "Pesanan Selesai");
    const returned = orders.filter((order) => order.status === "Dikembalikan");
    return send(res, 200, {
      completed_orders: completed.length,
      returned_orders: returned.length,
      income_rule: "Seller income = subtotal - discount untuk order berstatus Pesanan Selesai. Delivery fee dan PPN tidak dihitung sebagai income Seller.",
      income: completed.reduce((total, order) => total + order.subtotal - order.discount, 0),
      orders: orders.map(orderDict),
    });
  }

  if (method === "GET" && pathname === "/api/buyer/wallet") {
    const buyer = requireRole(req, state, "Buyer");
    return send(res, 200, {
      balance: walletBalance(state, buyer.id),
      transactions: state.walletTransactions.filter((tx) => tx.buyer_id === buyer.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    });
  }

  if (method === "POST" && pathname === "/api/buyer/wallet/topup") {
    const buyer = requireRole(req, state, "Buyer");
    const amount = Number(body.amount);
    assertCondition(Number.isFinite(amount) && amount > 0 && amount <= 100000000, 422, "Nominal top-up tidak valid");
    state.walletTransactions.push({ id: nextId(state, "walletTransactions"), buyer_id: buyer.id, kind: "TOPUP", amount, note: "Top-up saldo", created_at: simulatedNow(state) });
    auditLog(state, actorFromUser(buyer, "Buyer"), "TOPUP_WALLET", "WalletTransaction", null, { amount });
    saveState(state);
    return send(res, 200, {
      balance: walletBalance(state, buyer.id),
      transactions: state.walletTransactions.filter((tx) => tx.buyer_id === buyer.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    });
  }

  if (method === "GET" && pathname === "/api/buyer/addresses") {
    const buyer = requireRole(req, state, "Buyer");
    return send(res, 200, state.addresses.filter((address) => address.buyer_id === buyer.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }

  if (method === "POST" && pathname === "/api/buyer/addresses") {
    const buyer = requireRole(req, state, "Buyer");
    const recipientName = escapeHtml(body.recipient_name || "");
    const phone = escapeHtml(body.phone || "");
    const fullAddress = escapeHtml(body.full_address || "");
    assertCondition(recipientName.length >= 2 && recipientName.length <= 100, 422, "Nama penerima harus 2-100 karakter");
    assertCondition(phone.length >= 6 && phone.length <= 30, 422, "Nomor telepon harus 6-30 karakter");
    validatePhone(phone);
    assertCondition(fullAddress.length >= 8 && fullAddress.length <= 1000, 422, "Alamat harus 8-1000 karakter");
    const address = { id: nextId(state, "addresses"), buyer_id: buyer.id, recipient_name: recipientName, phone, full_address: fullAddress, created_at: simulatedNow(state) };
    state.addresses.push(address);
    auditLog(state, actorFromUser(buyer, "Buyer"), "CREATE_ADDRESS", "Address", address.id, {});
    saveState(state);
    return send(res, 201, address);
  }

  if (method === "GET" && pathname === "/api/buyer/cart") {
    const buyer = requireRole(req, state, "Buyer");
    return send(res, 200, cartSummaryForBuyer(state, buyer.id));
  }

  if (method === "POST" && pathname === "/api/buyer/cart/items") {
    const buyer = requireRole(req, state, "Buyer");
    const product = getProduct(state, body.product_id);
    const quantity = Number(body.quantity);
    assertCondition(product, 404, "Produk tidak ditemukan");
    assertCondition(Number.isInteger(quantity) && quantity > 0 && quantity <= 999, 422, "Quantity tidak valid");
    assertCondition(quantity <= product.stock, 400, "Quantity melebihi stok");
    const cart = state.cartItems.filter((item) => item.buyer_id === buyer.id);
    assertCondition(!cart.some((item) => getProduct(state, item.product_id)?.store_id !== product.store_id), 400, "Single-store checkout: cart hanya boleh berisi produk dari satu toko. Kosongkan cart sebelum menambah produk toko lain.");
    const existing = cart.find((item) => item.product_id === product.id);
    if (existing) {
      assertCondition(existing.quantity + quantity <= product.stock, 400, "Quantity total melebihi stok");
      existing.quantity += quantity;
    } else {
      state.cartItems.push({ id: nextId(state, "cartItems"), buyer_id: buyer.id, product_id: product.id, quantity });
    }
    saveState(state);
    return send(res, 201, cartSummaryForBuyer(state, buyer.id));
  }

  if ((method === "PATCH" || method === "DELETE") && (match = pathname.match(/^\/api\/buyer\/cart\/items\/(\d+)$/))) {
    const buyer = requireRole(req, state, "Buyer");
    const item = state.cartItems.find((candidate) => candidate.id === Number(match[1]) && candidate.buyer_id === buyer.id);
    assertCondition(item, 404, "Item cart tidak ditemukan");
    if (method === "DELETE") {
      state.cartItems = state.cartItems.filter((candidate) => candidate.id !== item.id);
    } else {
      const quantity = Number(body.quantity);
      assertCondition(Number.isInteger(quantity) && quantity > 0 && quantity <= 999, 422, "Quantity tidak valid");
      assertCondition(quantity <= getProduct(state, item.product_id).stock, 400, "Quantity melebihi stok");
      item.quantity = quantity;
    }
    saveState(state);
    return send(res, 200, cartSummaryForBuyer(state, buyer.id));
  }

  if (method === "DELETE" && pathname === "/api/buyer/cart") {
    const buyer = requireRole(req, state, "Buyer");
    state.cartItems = state.cartItems.filter((item) => item.buyer_id !== buyer.id);
    saveState(state);
    return send(res, 200, { message: "Cart dikosongkan", items: [], subtotal: 0 });
  }

  if (method === "POST" && pathname === "/api/buyer/checkout/summary") {
    const buyer = requireRole(req, state, "Buyer");
    const address = state.addresses.find((candidate) => candidate.id === Number(body.address_id) && candidate.buyer_id === buyer.id);
    assertCondition(address, 404, "Alamat tidak ditemukan");
    return send(res, 200, buildCheckoutSummary(state, buyer.id, body.delivery_method, body.discount_code));
  }

  if (method === "POST" && pathname === "/api/buyer/checkout") {
    const buyer = requireRole(req, state, "Buyer");
    const address = state.addresses.find((candidate) => candidate.id === Number(body.address_id) && candidate.buyer_id === buyer.id);
    assertCondition(address, 404, "Alamat tidak ditemukan");
    const summary = buildCheckoutSummary(state, buyer.id, body.delivery_method, body.discount_code);
    assertCondition(walletBalance(state, buyer.id) >= summary.final_total, 400, "Saldo wallet tidak cukup");
    for (const item of summary.items) {
      const product = getProduct(state, item.product_id);
      assertCondition(product && product.stock >= item.quantity, 400, `Stok produk ${item.product_name} tidak cukup`);
    }
    const store = getStore(state, summary.store_id);
    const order = {
      id: nextId(state, "orders"),
      buyer_id: buyer.id,
      store_id: store.id,
      seller_id: store.seller_id,
      address_snapshot: `${address.recipient_name} | ${address.phone} | ${address.full_address}`,
      delivery_method: body.delivery_method,
      subtotal: summary.subtotal,
      discount: summary.discount,
      discount_code: summary.discount_code,
      discount_type: summary.discount_type,
      delivery_fee: summary.delivery_fee,
      ppn: summary.ppn,
      final_total: summary.final_total,
      status: "Sedang Dikemas",
      driver_id: null,
      driver_earning: 0,
      is_refunded: false,
      created_at: simulatedNow(state),
      completed_at: null,
      items: summary.items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        price: item.price,
        quantity: item.quantity,
      })),
      history: [],
    };
    for (const item of summary.items) getProduct(state, item.product_id).stock -= item.quantity;
    state.walletTransactions.push({ id: nextId(state, "walletTransactions"), buyer_id: buyer.id, kind: "CHECKOUT", amount: -summary.final_total, note: `Pembayaran order #${order.id}`, created_at: simulatedNow(state) });
    setStatus(state, order, "Sedang Dikemas", "Order berhasil dibuat dan sedang dikemas Seller");
    if (summary.discount_type === "Voucher" && summary.discount_code) {
      const voucher = state.vouchers.find((candidate) => candidate.code === summary.discount_code);
      if (voucher) voucher.remaining_usage -= 1;
    }
    state.orders.push(order);
    state.cartItems = state.cartItems.filter((item) => item.buyer_id !== buyer.id);
    notifyUser(state, buyer.id, "Buyer", "Checkout berhasil", `Order #${order.id} dibuat dengan total ${roundMoney(order.final_total)}.`, `#/orders/${order.id}`, "success");
    notifyUser(state, order.seller_id, "Seller", "Order baru masuk", `Order #${order.id} menunggu diproses.`, "#/dashboard", "info");
    auditLog(state, actorFromUser(buyer, "Buyer"), "CHECKOUT", "Order", order.id, { final_total: order.final_total, discount_code: order.discount_code, delivery_method: order.delivery_method });
    saveState(state);
    return send(res, 200, { message: "Checkout berhasil", order: orderDict(order) });
  }

  if (method === "GET" && pathname === "/api/buyer/orders") {
    const buyer = requireRole(req, state, "Buyer");
    return send(res, 200, state.orders.filter((order) => order.buyer_id === buyer.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(orderDict));
  }

  if (method === "GET" && (match = pathname.match(/^\/api\/buyer\/orders\/(\d+)$/))) {
    const buyer = requireRole(req, state, "Buyer");
    const order = getOrder(state, match[1]);
    assertCondition(order && order.buyer_id === buyer.id, 404, "Order tidak ditemukan");
    return send(res, 200, orderDict(order));
  }

  if (method === "GET" && pathname === "/api/buyer/report") {
    const buyer = requireRole(req, state, "Buyer");
    const orders = state.orders.filter((order) => order.buyer_id === buyer.id);
    return send(res, 200, {
      spending: orders.filter((order) => !order.is_refunded && order.status !== "Dikembalikan").reduce((total, order) => total + order.final_total, 0),
      returned_or_refunded: orders.filter((order) => order.is_refunded).reduce((total, order) => total + order.final_total, 0),
      order_count: orders.length,
      orders: orders.map(orderDict),
    });
  }

  if (method === "GET" && pathname === "/api/driver/jobs/available") {
    requireRole(req, state, "Driver");
    return send(res, 200, state.deliveryJobs
      .filter((job) => job.status === "Available" && getOrder(state, job.order_id)?.status === "Menunggu Pengirim")
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((job) => deliveryJobDict(state, job)));
  }

  if (method === "GET" && pathname === "/api/driver/dashboard") {
    const driver = requireRole(req, state, "Driver");
    const jobs = state.deliveryJobs.filter((job) => job.driver_id === driver.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return send(res, 200, {
      earning_rule: "Driver earning = 80% dari delivery fee untuk job yang sudah Completed.",
      earnings: jobs.filter((job) => job.status === "Completed").reduce((total, job) => total + (getOrder(state, job.order_id)?.driver_earning || 0), 0),
      active_jobs: jobs.filter((job) => job.status === "Taken").map((job) => ({ job_id: job.id, order: orderDict(getOrder(state, job.order_id)), status: job.status })),
      job_history: jobs.map((job) => ({ job_id: job.id, order: orderDict(getOrder(state, job.order_id)), status: job.status, created_at: job.created_at, completed_at: job.completed_at })),
    });
  }

  if (method === "GET" && (match = pathname.match(/^\/api\/driver\/jobs\/(\d+)$/))) {
    const driver = requireRole(req, state, "Driver");
    const job = getDeliveryJob(state, match[1]);
    assertCondition(job, 404, "Job tidak ditemukan");
    const order = getOrder(state, job.order_id);
    const isAvailable = job.status === "Available" && order?.status === "Menunggu Pengirim";
    const isOwned = job.driver_id === driver.id;
    assertCondition(isAvailable || isOwned, 403, "Driver hanya dapat melihat job tersedia atau job miliknya");
    return send(res, 200, deliveryJobDict(state, job));
  }

  if (method === "POST" && (match = pathname.match(/^\/api\/driver\/jobs\/(\d+)\/take$/))) {
    const driver = requireRole(req, state, "Driver");
    const job = getDeliveryJob(state, match[1]);
    assertCondition(job, 404, "Job tidak ditemukan");
    const order = getOrder(state, job.order_id);
    assertCondition(job.status === "Available" && job.driver_id === null && order.status === "Menunggu Pengirim", 400, "Job sudah diambil atau belum siap");
    job.status = "Taken";
    job.driver_id = driver.id;
    job.taken_at = simulatedNow(state);
    order.driver_id = driver.id;
    setStatus(state, order, "Sedang Dikirim", "Driver mengambil job dan sedang mengirim pesanan");
    notifyUser(state, order.buyer_id, "Buyer", "Pesanan sedang dikirim", `Order #${order.id} sudah diambil driver.`, `#/orders/${order.id}`, "info");
    notifyUser(state, order.seller_id, "Seller", "Driver mengambil order", `Order #${order.id} sedang dikirim.`, "#/dashboard", "info");
    auditLog(state, actorFromUser(driver, "Driver"), "TAKE_DELIVERY_JOB", "DeliveryJob", job.id, { order_id: order.id });
    saveState(state);
    return send(res, 200, { message: "Job berhasil diambil", job_id: job.id, order: orderDict(order) });
  }

  if (method === "POST" && (match = pathname.match(/^\/api\/driver\/jobs\/(\d+)\/complete$/))) {
    const driver = requireRole(req, state, "Driver");
    const job = getDeliveryJob(state, match[1]);
    assertCondition(job && job.driver_id === driver.id, 404, "Job tidak ditemukan untuk Driver ini");
    const order = getOrder(state, job.order_id);
    assertCondition(job.status === "Taken" && order.status === "Sedang Dikirim", 400, "Job tidak dalam status pengiriman");
    job.status = "Completed";
    job.completed_at = simulatedNow(state);
    order.completed_at = simulatedNow(state);
    order.driver_earning = roundMoney(order.delivery_fee * DRIVER_EARNING_RATE);
    setStatus(state, order, "Pesanan Selesai", "Driver mengonfirmasi pesanan selesai");
    notifyUser(state, order.buyer_id, "Buyer", "Pesanan selesai", `Order #${order.id} sudah selesai.`, `#/orders/${order.id}`, "success");
    notifyUser(state, order.seller_id, "Seller", "Order selesai", `Order #${order.id} selesai dan masuk laporan income.`, "#/dashboard", "success");
    notifyUser(state, driver.id, "Driver", "Earning tercatat", `Earning job #${job.id} sebesar ${roundMoney(order.driver_earning)}.`, "#/dashboard", "success");
    auditLog(state, actorFromUser(driver, "Driver"), "COMPLETE_DELIVERY_JOB", "DeliveryJob", job.id, { order_id: order.id, earning: order.driver_earning });
    saveState(state);
    return send(res, 200, { message: "Job selesai", job_id: job.id, earning: order.driver_earning, order: orderDict(order) });
  }

  if (method === "GET" && pathname === "/api/admin/dashboard") {
    requireRole(req, state, "Admin");
    const overdue = findOverdueOrders(state);
    return send(res, 200, {
      simulated_now: simulatedNow(state),
      users: state.users.length,
      stores: state.stores.length,
      products: state.products.length,
      orders: state.orders.length,
      vouchers: state.vouchers.length,
      promos: state.promos.length,
      delivery_jobs: state.deliveryJobs.length,
      overdue_orders: overdue.map(orderDict),
      status_summary: Object.fromEntries(MAIN_STATUSES.map((status) => [status, state.orders.filter((order) => order.status === status).length])),
    });
  }

  if (method === "GET" && pathname === "/api/admin/analytics") {
    requireRole(req, state, "Admin");
    return send(res, 200, adminAnalytics(state));
  }

  if (method === "GET" && pathname === "/api/admin/audit-logs") {
    requireRole(req, state, "Admin");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 80), 1), 200);
    return send(res, 200, [...state.auditLogs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit));
  }

  if (method === "GET" && pathname === "/api/admin/users") {
    requireRole(req, state, "Admin");
    return send(res, 200, state.users.sort((a, b) => a.id - b.id).map((user) => userDict(user)));
  }

  if (method === "GET" && pathname === "/api/admin/stores") {
    requireRole(req, state, "Admin");
    return send(res, 200, state.stores);
  }

  if (method === "GET" && pathname === "/api/admin/products") {
    requireRole(req, state, "Admin");
    return send(res, 200, state.products.sort((a, b) => a.id - b.id).map((product) => productPublicDict(state, product)));
  }

  if (method === "GET" && pathname === "/api/admin/orders") {
    requireRole(req, state, "Admin");
    return send(res, 200, state.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(orderDict));
  }

  if (method === "GET" && pathname === "/api/admin/delivery-jobs") {
    requireRole(req, state, "Admin");
    return send(res, 200, state.deliveryJobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((job) => deliveryJobDict(state, job)));
  }

  if (method === "GET" && pathname === "/api/admin/vouchers") {
    requireRole(req, state, "Admin");
    return send(res, 200, state.vouchers.sort((a, b) => a.id - b.id).map(voucherDict));
  }

  if (method === "GET" && (match = pathname.match(/^\/api\/admin\/vouchers\/(\d+)$/))) {
    requireRole(req, state, "Admin");
    const voucher = state.vouchers.find((candidate) => candidate.id === Number(match[1]));
    assertCondition(voucher, 404, "Voucher tidak ditemukan");
    return send(res, 200, voucherDict(voucher));
  }

  if (method === "POST" && pathname === "/api/admin/vouchers") {
    const admin = requireRole(req, state, "Admin");
    const code = escapeHtml(body.code || "").toUpperCase();
    const value = Number(body.value);
    const expiryDays = Number(body.expiry_days);
    const remainingUsage = Number(body.remaining_usage);
    assertCondition(code.length >= 3 && code.length <= 40, 422, "Kode voucher harus 3-40 karakter");
    assertCondition(Number.isFinite(value) && value > 0, 422, "Value voucher harus lebih dari 0");
    assertCondition(Number.isInteger(expiryDays) && expiryDays > 0 && expiryDays <= 365, 422, "Expiry days tidak valid");
    assertCondition(Number.isInteger(remainingUsage) && remainingUsage > 0 && remainingUsage <= 100000, 422, "Remaining usage tidak valid");
    assertCondition(!state.vouchers.some((voucher) => voucher.code === code) && !state.promos.some((promo) => promo.code === code), 400, "Kode diskon sudah digunakan");
    const voucher = { id: nextId(state, "vouchers"), code, value, expiry_date: new Date(new Date(simulatedNow(state)).getTime() + expiryDays * DAY_MS).toISOString(), remaining_usage: remainingUsage, created_at: simulatedNow(state) };
    state.vouchers.push(voucher);
    auditLog(state, actorFromUser(admin, "Admin"), "CREATE_VOUCHER", "Voucher", voucher.id, { code: voucher.code, value: voucher.value, remaining_usage: voucher.remaining_usage });
    saveState(state);
    return send(res, 201, voucherDict(voucher));
  }

  if (method === "GET" && pathname === "/api/admin/promos") {
    requireRole(req, state, "Admin");
    return send(res, 200, state.promos.sort((a, b) => a.id - b.id).map(promoDict));
  }

  if (method === "GET" && (match = pathname.match(/^\/api\/admin\/promos\/(\d+)$/))) {
    requireRole(req, state, "Admin");
    const promo = state.promos.find((candidate) => candidate.id === Number(match[1]));
    assertCondition(promo, 404, "Promo tidak ditemukan");
    return send(res, 200, promoDict(promo));
  }

  if (method === "POST" && pathname === "/api/admin/promos") {
    const admin = requireRole(req, state, "Admin");
    const code = escapeHtml(body.code || "").toUpperCase();
    const percent = Number(body.percent);
    const expiryDays = Number(body.expiry_days);
    assertCondition(code.length >= 3 && code.length <= 40, 422, "Kode promo harus 3-40 karakter");
    assertCondition(Number.isFinite(percent) && percent > 0 && percent <= 100, 422, "Percent promo harus 1-100");
    assertCondition(Number.isInteger(expiryDays) && expiryDays > 0 && expiryDays <= 365, 422, "Expiry days tidak valid");
    assertCondition(!state.vouchers.some((voucher) => voucher.code === code) && !state.promos.some((promo) => promo.code === code), 400, "Kode diskon sudah digunakan");
    const promo = { id: nextId(state, "promos"), code, percent, expiry_date: new Date(new Date(simulatedNow(state)).getTime() + expiryDays * DAY_MS).toISOString(), created_at: simulatedNow(state) };
    state.promos.push(promo);
    auditLog(state, actorFromUser(admin, "Admin"), "CREATE_PROMO", "Promo", promo.id, { code: promo.code, percent: promo.percent });
    saveState(state);
    return send(res, 201, promoDict(promo));
  }

  if (method === "POST" && pathname === "/api/admin/simulate-next-day") {
    const admin = requireRole(req, state, "Admin");
    state.dayOffset = Number(state.dayOffset || 0) + 1;
    const overdue = findOverdueOrders(state);
    overdue.forEach((order) => applyOverdueRefund(state, order, actorFromUser(admin, "Admin")));
    auditLog(state, actorFromUser(admin, "Admin"), "SIMULATE_NEXT_DAY", "AppState", "dayOffset", { day_offset: state.dayOffset, overdue_handled: overdue.map((order) => order.id) });
    saveState(state);
    return send(res, 200, { message: "Proses hari berikutnya berjalan", simulated_now: simulatedNow(state), overdue_handled: overdue.map((order) => order.id) });
  }

  if (method === "POST" && pathname === "/api/admin/run-overdue-check") {
    const admin = requireRole(req, state, "Admin");
    const overdue = findOverdueOrders(state);
    overdue.forEach((order) => applyOverdueRefund(state, order, actorFromUser(admin, "Admin")));
    auditLog(state, actorFromUser(admin, "Admin"), "RUN_OVERDUE_CHECK", "Order", null, { overdue_handled: overdue.map((order) => order.id) });
    saveState(state);
    return send(res, 200, { message: "Overdue check selesai", overdue_handled: overdue.map((order) => order.id) });
  }

  assertCondition(false, 404, "Endpoint tidak ditemukan");
}

function createHandler(state) {
  return async (req, res) => {
    try {
      if (req.method === "OPTIONS") return send(res, 204, "");
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(url.pathname);
      const isReadRequest = req.method === "GET" || req.method === "HEAD";
      if (isReadRequest && pathname === "/") return serveStatic(req, res, pathname);
      if (isReadRequest && !pathname.startsWith("/api/") && !["/health", "/openapi.json", "/docs"].includes(pathname)) {
        return serveStatic(req, res, pathname);
      }
      if (isReadRequest && pathname.startsWith("/static/")) return serveStatic(req, res, pathname);
      if (isReadRequest && pathname === "/docs") return send(res, 200, docsHtml());
      return await apiHandler(req, res, state, pathname, url);
    } catch (error) {
      if (!res.writableEnded) {
        send(res, error.status || 500, { detail: error.status ? error.message : "Terjadi kesalahan server" });
      }
    }
  };
}

module.exports = {
  APP_NAME,
  apiHandler,
  createHandler,
  docsHtml,
  loadState,
  seedState,
  send,
  serveStatic,
};
