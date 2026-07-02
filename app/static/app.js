const API = "/api";
const app = document.getElementById("app");
const nav = document.getElementById("nav");
const state = { user: null, products: [], reviews: [] };

function token() { return localStorage.getItem("seapedia_token"); }
function setToken(value) { value ? localStorage.setItem("seapedia_token", value) : localStorage.removeItem("seapedia_token"); }
function rupiah(value) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0); }
function dt(value) { return value ? new Date(value).toLocaleString("id-ID") : "-"; }
function esc(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function setView(html) { app.innerHTML = html; window.scrollTo({top:0, behavior:"smooth"}); }
function message(text, type="notice") { return `<div class="notice ${type}">${esc(text)}</div>`; }

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(API + path, { ...options, headers });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map(d => d.msg).join(", ") : (data.detail || "Request gagal");
    throw new Error(detail);
  }
  return data;
}

async function refreshMe() {
  if (!token()) { state.user = null; renderNav(); return null; }
  try {
    state.user = await api("/me");
  } catch (e) {
    setToken(null);
    state.user = null;
  }
  renderNav();
  return state.user;
}

function renderNav() {
  const user = state.user;
  nav.innerHTML = `
    <a class="btn secondary" href="#/">Home</a>
    <a class="btn secondary" href="#/products">Produk</a>
    <a class="btn secondary" href="#/reviews">Review</a>
    ${user ? `<span class="badge">${esc(user.username)} · ${esc(user.active_role || "Pilih role")}</span><a class="btn secondary" href="#/dashboard">Dashboard</a><button class="danger" onclick="logout()">Logout</button>` : `<a class="btn secondary" href="#/login">Login</a><a class="btn" href="#/register">Register</a>`}
  `;
}

async function logout() {
  try { await api("/auth/logout", { method: "POST" }); } catch {}
  setToken(null);
  state.user = null;
  location.hash = "#/";
  renderNav();
  route();
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function pageHome() {
  const [products, reviews] = await Promise.all([api("/products"), api("/reviews")]);
  state.products = products; state.reviews = reviews;
  setView(`
    <section class="hero-visual">
      <div class="hero-copy">
        <h1>Marketplace terpadu untuk belanja dan operasional toko.</h1>
        <p>SEAPEDIA menghubungkan pembeli, penjual, kurir, dan admin dalam satu alur transaksi yang rapi, mulai dari katalog produk sampai pengiriman dan monitoring pesanan.</p>
        <div class="actions"><a class="btn" href="#/products">Lihat Produk</a><a class="btn ghost" href="#/register">Buat Akun</a></div>
        <div class="stats">
          <div class="stat"><b>${products.length}</b>Produk</div>
          <div class="stat"><b>${reviews.length}</b>Review</div>
          <div class="stat"><b>4</b>Role</div>
        </div>
      </div>
    </section>
    <section class="panel latest-products-panel">
      <div class="actions latest-products-heading">
        <h2>Produk terbaru</h2>
        <a class="btn secondary" href="#/products">Lihat Semua</a>
      </div>
      <div class="latest-products-grid">${products.slice(0,4).map(latestProductCard).join("")}</div>
    </section>
  `);
}

function productImage(p) {
  const text = `${p.name || ""} ${p.description || ""} ${p.store?.name || ""}`.toLowerCase();
  if (text.includes("udang") || text.includes("vaname") || text.includes("shrimp")) return "/static/products/udang-vaname.png";
  if (text.includes("keranjang") || text.includes("basket")) return "/static/products/keranjang-lipat.png";
  if (text.includes("cooler") || text.includes("pendingin") || text.includes("box")) return "/static/products/cooler-box-mini.png";
  if (text.includes("ikan") || text.includes("tuna") || text.includes("laut") || text.includes("fish")) return "/static/products/tuna-premium.png";
  return "/static/products/keranjang-lipat.png";
}

function productVisual(p, variant = "thumb") {
  return `<figure class="product-media ${variant}">
    <img src="${productImage(p)}" alt="Ilustrasi ${esc(p.name)}" loading="lazy">
  </figure>`;
}

function productCard(p) {
  return `<article class="card product-card">
    ${productVisual(p)}
    <div class="product-card-body">
      <a class="badge" href="#/stores/${p.store.id}">${esc(p.store.name)}</a>
      <h3>${esc(p.name)}</h3>
      <p class="muted">${esc(p.description)}</p>
      <div class="price">${rupiah(p.price)}</div>
      <div class="muted">Stok: ${p.stock}</div>
    </div>
    <div class="actions"><a class="btn secondary" href="#/products/${p.id}">Detail</a>${state.user?.active_role === "Buyer" ? `<button class="btn" onclick="quickAdd(${p.id})">Tambah Cart</button>` : ""}</div>
  </article>`;
}

function latestProductCard(p) {
  return `<article class="card latest-product-card">
    ${productVisual(p, "latest")}
    <div class="latest-product-body">
      <a class="badge" href="#/stores/${p.store.id}">${esc(p.store.name)}</a>
      <h3>${esc(p.name)}</h3>
      <p class="muted">${esc(p.description)}</p>
      <div class="price">${rupiah(p.price)}</div>
      <a class="btn secondary" href="#/products/${p.id}">Detail</a>
    </div>
  </article>`;
}

function reviewCard(r) {
  return `<article class="card"><b>${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</b><h3>${esc(r.reviewer_name)}</h3><p>${esc(r.comment)}</p><small class="muted">${dt(r.created_at)}</small></article>`;
}

async function pageProducts() {
  const products = await api("/products");
  state.products = products;
  const stores = [...new Map(products.map(p => [p.store.id, p.store])).values()];
  setView(`
    <section class="panel">
      <h2>Katalog Publik</h2>
      <p class="muted">Pengunjung dapat melihat katalog dan detail produk. Checkout tersedia setelah masuk sebagai Buyer.</p>
      <form id="catalogFilter" class="form-grid">
        <label>Pencarian<input name="q" placeholder="Cari produk atau store"></label>
        <label>Toko<select name="store_id"><option value="">Semua toko</option>${stores.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>
        <label>Harga Minimum<input name="min_price" type="number" min="0" placeholder="0"></label>
        <label>Harga Maksimum<input name="max_price" type="number" min="0" placeholder="200000"></label>
        <label>Urutkan<select name="sort"><option value="newest">Terbaru</option><option value="price_asc">Harga Terendah</option><option value="price_desc">Harga Tertinggi</option><option value="stock_desc">Stok Terbanyak</option><option value="name_asc">Nama Produk</option></select></label>
        <label><span>Ketersediaan</span><select name="in_stock"><option value="">Semua</option><option value="true">Stok tersedia</option></select></label>
        <button class="btn full">Terapkan Filter</button>
      </form>
    </section><br>
    <section id="catalogSummary" class="notice">${products.length} produk ditemukan.</section><br>
    <section id="catalogResults" class="product-list">${products.map(productCard).join("")}</section>
  `);
  document.getElementById("catalogFilter").onsubmit = async e => {
    e.preventDefault();
    const data = formData(e.target);
    const params = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => { if (value) params.set(key, value); });
    const filtered = await api(`/products?${params.toString()}`);
    state.products = filtered;
    document.getElementById("catalogSummary").innerHTML = `${filtered.length} produk ditemukan.`;
    document.getElementById("catalogResults").innerHTML = filtered.map(productCard).join("") || message("Tidak ada produk sesuai filter.");
  };
}

async function pageProductDetail(id) {
  const p = await api(`/products/${id}`);
  setView(`
    <section class="grid cols-2">
      <div class="panel product-detail-visual">
        ${productVisual(p, "detail")}
      </div>
      <div class="panel">
        <span class="badge">${esc(p.store.name)}</span>
        <h1>${esc(p.name)}</h1>
        <p>${esc(p.description)}</p>
        <div class="price">${rupiah(p.price)}</div>
        <p class="muted">Stok tersedia: ${p.stock}</p>
        <div class="actions">${state.user?.active_role === "Buyer" ? `<button class="btn" onclick="quickAdd(${p.id})">Tambah ke Cart</button><a class="btn secondary" href="#/dashboard">Lihat Cart</a>` : `<a class="btn secondary" href="#/login">Login sebagai Buyer untuk checkout</a>`}</div>
      </div>
      <div class="panel">
        <h2>Informasi Store</h2>
        <p><b>${esc(p.store.name)}</b></p>
        <p class="muted">${esc(p.store.description)}</p>
        <div class="notice">SEAPEDIA adalah marketplace multi-seller. Cart hanya boleh berisi produk dari satu toko.</div><br>
        <a class="btn secondary" href="#/stores/${p.store.id}">Lihat Store</a>
      </div>
    </section>
  `);
}

async function pageStoreDetail(id) {
  const store = await api(`/stores/${id}`);
  setView(`
    <section class="panel">
      <div class="actions" style="justify-content:space-between;align-items:center">
        <div><h1>${esc(store.name)}</h1><p class="muted">${esc(store.description)}</p></div>
        <a class="btn secondary" href="#/products">Kembali ke Katalog</a>
      </div>
    </section><br>
    <section class="grid cols-3">
      <div class="kpi"><span>Products</span><b>${store.product_count}</b></div>
      <div class="kpi"><span>Completed Orders</span><b>${store.completed_orders}</b></div>
      <div class="kpi"><span>Income</span><b>${rupiah(store.income)}</b></div>
    </section><br>
    <section class="product-list">${store.products.map(productCard).join("") || message("Store belum punya produk.")}</section>
  `);
}

async function quickAdd(productId) {
  try {
    await api("/buyer/cart/items", { method: "POST", body: JSON.stringify({ product_id: productId, quantity: 1 }) });
    alert("Produk masuk cart.");
  } catch (e) { alert(e.message); }
}

function pageLogin() {
  setView(`
    <section class="auth-layout">
      <aside class="auth-copy">
        <span class="badge">SEAPEDIA Access</span>
        <h1>Masuk ke akun operasional SEAPEDIA.</h1>
        <p>Akses dashboard disesuaikan dengan role aktif akun, sehingga setiap pengguna hanya melihat fitur yang relevan dengan tanggung jawabnya.</p>
        <div class="auth-steps">
          <div><b>1</b><span>Masuk dengan akun terdaftar.</span></div>
          <div><b>2</b><span>Pilih role aktif bila akun memiliki beberapa role.</span></div>
          <div><b>3</b><span>Kelola transaksi dari dashboard pribadi.</span></div>
        </div>
      </aside>
      <section class="panel auth-card">
        <div class="auth-heading">
          <h1>Login</h1>
          <p class="muted">Masukkan username dan password untuk mengakses dashboard.</p>
        </div>
        <form id="loginForm" class="auth-form">
          <label>Username<input id="loginUsername" name="username" required autocomplete="username" placeholder="Username"></label>
          <label>Password
            <div class="input-action">
              <input id="loginPassword" name="password" type="password" required autocomplete="current-password" placeholder="Password">
              <button type="button" class="mini-btn" onclick="togglePassword('loginPassword')">Show</button>
            </div>
          </label>
          <button class="btn full">Login</button>
        </form>
        <p class="muted auth-switch">Belum punya akun? <a href="#/register">Register akun baru</a></p>
        <div id="loginMsg"></div>
      </section>
    </section>
  `);
  document.getElementById("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById("loginMsg");
    try {
      const data = await api("/auth/login", { method: "POST", body: JSON.stringify(formData(e.target)) });
      setToken(data.access_token);
      await refreshMe();
      location.hash = data.needs_role_selection ? "#/choose-role" : "#/dashboard";
    } catch (err) { msg.innerHTML = message(err.message, "error"); }
  };
}

function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

function pageRegister() {
  setView(`
    <section class="auth-layout">
      <aside class="auth-copy">
        <span class="badge">Buat Akun</span>
        <h1>Satu akun bisa punya beberapa role.</h1>
        <p>Pilih role sesuai kebutuhan akun. Jika lebih dari satu role dipilih, pengguna akan diarahkan untuk menentukan active role saat masuk.</p>
        <div class="auth-steps">
          <div><b>1</b><span>Buat identitas akun.</span></div>
          <div><b>2</b><span>Pilih role transaksi.</span></div>
          <div><b>3</b><span>Masuk ke dashboard role aktif.</span></div>
        </div>
      </aside>
      <section class="panel auth-card">
        <div class="auth-heading">
          <h1>Register</h1>
          <p class="muted">Admin tidak dibuka lewat register agar akses monitoring tetap terkontrol.</p>
        </div>
        <form id="registerForm" class="auth-form">
          <div class="form-grid">
            <label>Username<input name="username" required autocomplete="username" placeholder="Username"></label>
            <label>Email<input name="email" type="email" required autocomplete="email" placeholder="nama@seapedia.id"></label>
          </div>
          <label>Password
            <div class="input-action">
              <input id="registerPassword" name="password" type="password" required minlength="6" autocomplete="new-password" placeholder="Minimal 6 karakter">
              <button type="button" class="mini-btn" onclick="togglePassword('registerPassword')">Show</button>
            </div>
          </label>
          <fieldset class="role-options">
            <legend>Role akun</legend>
            <label><input type="checkbox" name="roles" value="Buyer" checked><span><b>Buyer</b><small>Belanja, cart, wallet, checkout.</small></span></label>
            <label><input type="checkbox" name="roles" value="Seller"><span><b>Seller</b><small>Kelola store, produk, dan order.</small></span></label>
            <label><input type="checkbox" name="roles" value="Driver"><span><b>Driver</b><small>Ambil job dan selesaikan pengiriman.</small></span></label>
          </fieldset>
          <button class="btn full">Buat Akun</button>
        </form>
        <p class="muted auth-switch">Sudah punya akun? <a href="#/login">Login di sini</a></p>
        <div id="regMsg"></div>
      </section>
    </section>
  `);
  document.getElementById("registerForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const roles = [...e.target.querySelectorAll('input[name="roles"]:checked')].map(o => o.value);
    const payload = { username: fd.get("username"), email: fd.get("email"), password: fd.get("password"), roles };
    const msg = document.getElementById("regMsg");
    try {
      if (!roles.length) throw new Error("Pilih minimal satu role.");
      const data = await api("/auth/register", { method: "POST", body: JSON.stringify(payload) });
      setToken(data.access_token);
      await refreshMe();
      location.hash = data.needs_role_selection ? "#/choose-role" : "#/dashboard";
    } catch (err) { msg.innerHTML = message(err.message, "error"); }
  };
}

async function pageReviews() {
  const reviews = await api("/reviews");
  setView(`
    <section class="grid cols-2">
      <div class="panel">
        <h1>Masukan Pengguna</h1>
        <p class="muted">Review ini untuk pengalaman aplikasi, bukan review produk. Pengunjung dapat mengirim review.</p>
        <form id="reviewForm" class="grid">
          <label>Nama<input name="reviewer_name" required></label>
          <label>Rating<select name="rating"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></label>
          <label>Komentar<textarea name="comment" required placeholder="Tulis feedback aplikasi"></textarea></label>
          <button class="btn">Kirim Review</button>
        </form>
        <div id="reviewMsg"></div>
      </div>
      <div class="panel"><h2>Testimonial</h2><div class="grid">${reviews.map(reviewCard).join("")}</div></div>
    </section>
  `);
  document.getElementById("reviewForm").onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById("reviewMsg");
    const data = formData(e.target); data.rating = Number(data.rating);
    try { await api("/reviews", { method: "POST", body: JSON.stringify(data) }); msg.innerHTML = message("Review berhasil dikirim.", "success"); e.target.reset(); await pageReviews(); }
    catch (err) { msg.innerHTML = message(err.message, "error"); }
  };
}

async function pageChooseRole() {
  const user = await refreshMe();
  if (!user) return location.hash = "#/login";
  setView(`
    <section class="panel" style="max-width:680px;margin:auto">
      <h1>Pilih Active Role</h1>
      <p class="muted">Authorization backend mengikuti active role ini, bukan hanya daftar role yang dimiliki.</p>
      <div class="grid cols-3">${user.roles.map(r => `<button class="btn" onclick="chooseRole('${r}')">${r}</button>`).join("")}</div>
    </section>
  `);
}

async function chooseRole(role) {
  try {
    const data = await api("/auth/choose-role", { method: "POST", body: JSON.stringify({ role }) });
    setToken(data.access_token);
    await refreshMe();
    location.hash = "#/dashboard";
  } catch (e) { alert(e.message); }
}

async function pageDashboard() {
  const user = await refreshMe();
  if (!user) return location.hash = "#/login";
  if (!user.active_role) return location.hash = "#/choose-role";
  if (user.active_role === "Buyer") return buyerDashboard();
  if (user.active_role === "Seller") return sellerDashboard();
  if (user.active_role === "Driver") return driverDashboard();
  if (user.active_role === "Admin") return adminDashboard();
}

function notificationPanel(notifications = { items: [], unread_count: 0 }) {
  const items = notifications.items || [];
  if (!items.length) return `<section class="panel notification-panel"><h2>Notifications</h2>${message("Tidak ada notifikasi untuk role aktif.")}</section><br>`;
  return `<section class="panel notification-panel">
    <div class="actions" style="justify-content:space-between;align-items:center">
      <h2>Notifications <span class="badge">${notifications.unread_count || 0} unread</span></h2>
      <button class="btn secondary" onclick="markNotificationsRead()">Mark Read</button>
    </div>
    <div class="grid">${items.slice(0, 5).map(n => `<article class="card ${n.read ? "" : "unread"}"><div class="actions" style="justify-content:space-between"><b>${esc(n.title)}</b><small class="muted">${dt(n.created_at)}</small></div><p>${esc(n.message)}</p><a class="btn secondary" href="${esc(n.href)}">Open</a></article>`).join("")}</div>
  </section><br>`;
}

async function markNotificationsRead() {
  await api("/notifications/read-all", { method: "POST" });
  pageDashboard();
}

function dashboardShell(title, body, notifications) {
  setView(`
    <section class="panel">
      <div class="actions" style="justify-content:space-between;align-items:center">
        <div><h1>${esc(title)}</h1><p class="muted">Role aktif: <b>${esc(state.user?.active_role)}</b>. Roles owned: ${esc((state.user?.roles || []).join(", "))}</p></div>
        ${(state.user?.roles || []).length > 1 ? `<a class="btn secondary" href="#/choose-role">Ganti Role</a>` : ""}
      </div>
    </section><br>${notificationPanel(notifications)}${body}
  `);
}

async function buyerDashboard() {
  const [wallet, addresses, cart, orders, report, notifications] = await Promise.all([
    api("/buyer/wallet"), api("/buyer/addresses"), api("/buyer/cart"), api("/buyer/orders"), api("/buyer/report"), api("/notifications")
  ]);
  const addressOptions = addresses.map(a => `<option value="${a.id}">${esc(a.recipient_name)} · ${esc(a.full_address)}</option>`).join("");
  dashboardShell("Buyer Dashboard", `
    <div class="tabs"><button onclick="showTab('wallet')" class="active">Wallet</button><button onclick="showTab('address')">Address</button><button onclick="showTab('cart')">Cart & Checkout</button><button onclick="showTab('orders')">Orders</button></div>
    <section id="tab-wallet" class="panel tab"><h2>Wallet</h2><div class="kpi"><span>Balance</span><b>${rupiah(wallet.balance)}</b></div><br>
      <form id="topupForm" class="form-grid"><label>Nominal top-up<input name="amount" type="number" min="1" value="500000"></label><button class="btn">Top Up Saldo</button></form><br>${txTable(wallet.transactions)}</section>
    <section id="tab-address" class="panel tab hidden"><h2>Delivery Address</h2><form id="addrForm" class="form-grid"><label>Penerima<input name="recipient_name" required></label><label>Telepon<input name="phone" required></label><label class="full">Alamat<textarea name="full_address" required></textarea></label><button class="btn full">Simpan Alamat</button></form><br>${addressTable(addresses)}</section>
    <section id="tab-cart" class="panel tab hidden"><h2>Cart</h2><div class="notice">Single-store checkout: cart hanya boleh berisi produk dari satu toko. Jika ingin belanja toko lain, kosongkan cart dulu.</div><br>${cartTable(cart)}<br>
      <form id="checkoutForm" class="form-grid"><label>Alamat<select name="address_id" required>${addressOptions}</select></label><label>Delivery<select name="delivery_method"><option>Instant</option><option>Next Day</option><option>Regular</option></select></label><label>Voucher/Promo<input name="discount_code" placeholder="HEMAT25 atau PROMO10"></label><div class="actions"><button class="btn secondary" type="button" onclick="checkoutSummary()">Lihat Summary</button><button class="btn">Checkout</button></div></form><div id="checkoutResult"></div></section>
    <section id="tab-orders" class="panel tab hidden"><h2>Order History</h2><div class="grid cols-2"><div class="kpi"><span>Total Spending</span><b>${rupiah(report.spending)}</b></div><div class="kpi"><span>Refunded</span><b>${rupiah(report.returned_or_refunded)}</b></div></div><br>${ordersList(orders)}</section>
  `, notifications);
  document.getElementById("topupForm").onsubmit = async e => { e.preventDefault(); const d = formData(e.target); d.amount = Number(d.amount); await api("/buyer/wallet/topup", {method:"POST", body:JSON.stringify(d)}); buyerDashboard(); };
  document.getElementById("addrForm").onsubmit = async e => { e.preventDefault(); await api("/buyer/addresses", {method:"POST", body:JSON.stringify(formData(e.target))}); buyerDashboard(); };
  document.getElementById("checkoutForm").onsubmit = async e => { e.preventDefault(); await doCheckout(); };
}

function showTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.add("hidden"));
  document.querySelector(`#tab-${name}`).classList.remove("hidden");
  document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
  [...document.querySelectorAll(".tabs button")].find(b => b.textContent.toLowerCase().includes(name.split('-')[0]))?.classList.add("active");
}
function txTable(rows) { return `<div class="table-wrap"><table><tr><th>Jenis</th><th>Nominal</th><th>Catatan</th><th>Tanggal</th></tr>${rows.map(t => `<tr><td>${esc(t.kind)}</td><td>${rupiah(t.amount)}</td><td>${esc(t.note)}</td><td>${dt(t.created_at)}</td></tr>`).join("")}</table></div>`; }
function addressTable(rows) { return `<div class="table-wrap"><table><tr><th>ID</th><th>Penerima</th><th>Telepon</th><th>Alamat</th></tr>${rows.map(a => `<tr><td>${a.id}</td><td>${esc(a.recipient_name)}</td><td>${esc(a.phone)}</td><td>${esc(a.full_address)}</td></tr>`).join("")}</table></div>`; }
function cartTable(cart) {
  if (!cart.items.length) return message("Cart kosong.");
  return `<p><b>Store:</b> ${esc(cart.store_name)} · <b>Subtotal:</b> ${rupiah(cart.subtotal)}</p><div class="table-wrap"><table><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Total</th><th>Aksi</th></tr>${cart.items.map(i => `<tr><td>${esc(i.product_name)}</td><td><input style="width:80px" type="number" min="1" max="${i.stock}" value="${i.quantity}" onchange="updateCart(${i.cart_item_id}, this.value)"></td><td>${rupiah(i.price)}</td><td>${rupiah(i.line_total)}</td><td><button class="btn danger" onclick="deleteCart(${i.cart_item_id})">Hapus</button></td></tr>`).join("")}</table></div><br><button class="btn secondary" onclick="clearCart()">Kosongkan Cart</button>`;
}
async function updateCart(id, qty) { await api(`/buyer/cart/items/${id}`, {method:"PATCH", body:JSON.stringify({quantity:Number(qty)})}); buyerDashboard(); }
async function deleteCart(id) { await api(`/buyer/cart/items/${id}`, {method:"DELETE"}); buyerDashboard(); }
async function clearCart() { await api(`/buyer/cart`, {method:"DELETE"}); buyerDashboard(); }
async function checkoutSummary() {
  const form = document.getElementById("checkoutForm");
  const payload = formData(form); payload.address_id = Number(payload.address_id); if (!payload.discount_code) payload.discount_code = null;
  const box = document.getElementById("checkoutResult");
  try {
    const s = await api("/buyer/checkout/summary", {method:"POST", body:JSON.stringify(payload)});
    box.innerHTML = `<br><div class="panel"><h3>Checkout Summary</h3><p>Subtotal: <b>${rupiah(s.subtotal)}</b></p><p>Discount: <b>${rupiah(s.discount)}</b> ${esc(s.discount_type || "")}</p><p>Delivery: <b>${rupiah(s.delivery_fee)}</b></p><p>PPN 12%: <b>${rupiah(s.ppn)}</b></p><h2>Final: ${rupiah(s.final_total)}</h2><p class="muted">${esc(s.ppn_rule)}</p></div>`;
  } catch (e) { box.innerHTML = message(e.message, "error"); }
}
async function doCheckout() {
  const form = document.getElementById("checkoutForm");
  const payload = formData(form); payload.address_id = Number(payload.address_id); if (!payload.discount_code) payload.discount_code = null;
  const box = document.getElementById("checkoutResult");
  try { const res = await api("/buyer/checkout", {method:"POST", body:JSON.stringify(payload)}); box.innerHTML = message(`Checkout berhasil. Order #${res.order.id}`, "success"); await buyerDashboard(); }
  catch (e) { box.innerHTML = message(e.message, "error"); }
}
function ordersList(orders) { return `<div class="grid">${orders.map(o => `<article class="card"><h3>Order #${o.id} · ${esc(o.status)}</h3><p>${esc(o.delivery_method)} · Final ${rupiah(o.final_total)} · Diskon ${rupiah(o.discount)} · PPN ${rupiah(o.ppn)}</p><div>${o.items.map(i => `<span class="badge">${esc(i.product_name)} x${i.quantity}</span>`).join(" ")}</div>${state.user?.active_role === "Buyer" ? `<div class="actions"><a class="btn secondary" href="#/orders/${o.id}">Detail Order</a></div>` : ""}${timeline(o.history)}</article>`).join("") || message("Belum ada order.")}</div>`; }
function timeline(history) { return `<div class="timeline">${(history || []).map(h => `<div class="timeline-item"><b>${esc(h.status)}</b><span>${esc(h.note)}<br><small class="muted">${dt(h.created_at)}</small></span></div>`).join("")}</div>`; }

async function pageOrderDetail(id) {
  const user = await refreshMe();
  if (!user) return location.hash = "#/login";
  if (user.active_role !== "Buyer") return setView(message("Detail order Buyer memerlukan active role Buyer.", "error"));
  const o = await api(`/buyer/orders/${id}`);
  setView(`
    <section class="panel">
      <div class="actions" style="justify-content:space-between;align-items:center">
        <div><h1>Order #${o.id}</h1><p class="muted">${esc(o.status)} · ${esc(o.delivery_method)} · ${dt(o.created_at)}</p></div>
        <a class="btn secondary" href="#/dashboard">Kembali ke Dashboard</a>
      </div>
    </section><br>
    <section class="grid cols-2">
      <div class="panel">
        <h2>Ringkasan Pembayaran</h2>
        <div class="table-wrap"><table>
          <tr><th>Subtotal</th><td>${rupiah(o.subtotal)}</td></tr>
          <tr><th>Discount</th><td>${rupiah(o.discount)} ${esc(o.discount_type || "")} ${esc(o.discount_code || "")}</td></tr>
          <tr><th>Delivery Fee</th><td>${rupiah(o.delivery_fee)}</td></tr>
          <tr><th>PPN 12%</th><td>${rupiah(o.ppn)}</td></tr>
          <tr><th>Final Total</th><td><b>${rupiah(o.final_total)}</b></td></tr>
        </table></div>
      </div>
      <div class="panel">
        <h2>Alamat dan Item</h2>
        <p>${esc(o.address_snapshot)}</p>
        <div>${o.items.map(i => `<span class="badge">${esc(i.product_name)} x${i.quantity} · ${rupiah(i.price)}</span>`).join(" ")}</div>
      </div>
    </section><br>
    <section class="panel"><h2>Status Timeline</h2>${timeline(o.history)}</section>
  `);
}

async function sellerDashboard() {
  const [store, products, orders, report, notifications] = await Promise.all([api("/seller/store"), api("/seller/products"), api("/seller/orders"), api("/seller/report"), api("/notifications")]);
  dashboardShell("Seller Dashboard", `
    <div class="tabs"><button onclick="showTab('store')" class="active">Store</button><button onclick="showTab('products')">Products</button><button onclick="showTab('orders')">Orders</button><button onclick="showTab('report')">Report</button></div>
    <section id="tab-store" class="panel tab"><h2>Store Management</h2><form id="storeForm" class="form-grid"><label>Nama Store<input name="name" required value="${esc(store?.name || "")}"></label><label class="full">Deskripsi<textarea name="description">${esc(store?.description || "")}</textarea></label><button class="btn full">Simpan Store</button></form></section>
    <section id="tab-products" class="panel tab hidden"><h2>Product CRUD</h2><form id="productForm" class="form-grid"><input type="hidden" name="id"><label>Nama Produk<input name="name" required></label><label>Harga<input name="price" type="number" min="1" required></label><label>Stok<input name="stock" type="number" min="0" required></label><label class="full">Deskripsi<textarea name="description"></textarea></label><button class="btn full">Simpan Produk</button></form><br>${sellerProductTable(products)}</section>
    <section id="tab-orders" class="panel tab hidden"><h2>Incoming Orders</h2>${sellerOrdersTable(orders)}</section>
    <section id="tab-report" class="panel tab hidden"><h2>Income Report</h2><div class="grid cols-3"><div class="kpi"><span>Income</span><b>${rupiah(report.income)}</b></div><div class="kpi"><span>Completed</span><b>${report.completed_orders}</b></div><div class="kpi"><span>Returned</span><b>${report.returned_orders}</b></div></div><p class="muted">${esc(report.income_rule)}</p></section>
  `, notifications);
  document.getElementById("storeForm").onsubmit = async e => { e.preventDefault(); await api("/seller/store", {method:"POST", body:JSON.stringify(formData(e.target))}); sellerDashboard(); };
  document.getElementById("productForm").onsubmit = async e => { e.preventDefault(); const d = formData(e.target); const id = d.id; delete d.id; d.price = Number(d.price); d.stock = Number(d.stock); await api(id ? `/seller/products/${id}` : "/seller/products", {method:id ? "PUT" : "POST", body:JSON.stringify(d)}); sellerDashboard(); };
}
function sellerProductTable(products) { return `<div class="table-wrap"><table><tr><th>ID</th><th>Produk</th><th>Harga</th><th>Stok</th><th>Aksi</th></tr>${products.map(p => `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${rupiah(p.price)}</td><td>${p.stock}</td><td><button class="btn secondary" onclick='editProduct(${JSON.stringify(p).replaceAll("'","&#39;")})'>Edit</button> <button class="btn danger" onclick="deleteProduct(${p.id})">Delete</button></td></tr>`).join("")}</table></div>`; }
function editProduct(p) { const f = document.getElementById("productForm"); f.id.value = p.id; f.name.value = p.name; f.price.value = p.price; f.stock.value = p.stock; f.description.value = p.description; window.scrollTo({top:f.offsetTop-80, behavior:"smooth"}); }
async function deleteProduct(id) { if(confirm("Hapus produk?")) { await api(`/seller/products/${id}`, {method:"DELETE"}); sellerDashboard(); } }
function sellerOrdersTable(orders) { return `<div class="grid">${orders.map(o => `<article class="card"><h3>Order #${o.id} · ${esc(o.status)}</h3><p>Final ${rupiah(o.final_total)} · Delivery ${esc(o.delivery_method)}</p><div class="actions">${o.status === "Sedang Dikemas" ? `<button class="btn" onclick="processOrder(${o.id})">Process to Menunggu Pengirim</button>` : ""}</div>${timeline(o.history)}</article>`).join("") || message("Belum ada order masuk.")}</div>`; }
async function processOrder(id) { await api(`/seller/orders/${id}/process`, {method:"POST"}); sellerDashboard(); }

async function driverDashboard() {
  const [available, dash, notifications] = await Promise.all([api("/driver/jobs/available"), api("/driver/dashboard"), api("/notifications")]);
  dashboardShell("Driver Dashboard", `
    <div class="tabs"><button onclick="showTab('available')" class="active">Available Jobs</button><button onclick="showTab('active')">Active</button><button onclick="showTab('history')">History & Earnings</button></div>
    <section id="tab-available" class="panel tab"><h2>Available Jobs</h2><div class="grid">${available.map(j => `<article class="card"><h3>Job #${j.job_id} · Order #${j.order.id}</h3><p>${esc(j.order.delivery_method)} · Fee ${rupiah(j.order.delivery_fee)} · ${esc(j.order.address_snapshot)}</p><div class="actions"><button class="btn secondary" onclick="viewDriverJob(${j.job_id})">Detail</button><button class="btn" onclick="takeJob(${j.job_id})">Take Job</button></div></article>`).join("") || message("Belum ada job tersedia. Seller harus process order dulu.")}</div></section>
    <section id="tab-active" class="panel tab hidden"><h2>Active Job</h2><div class="grid">${dash.active_jobs.map(j => `<article class="card"><h3>Job #${j.job_id} · Order #${j.order.id}</h3><p>Status ${esc(j.order.status)} · Fee ${rupiah(j.order.delivery_fee)}</p><div class="actions"><button class="btn secondary" onclick="viewDriverJob(${j.job_id})">Detail</button><button class="btn" onclick="completeJob(${j.job_id})">Confirm Completed</button></div></article>`).join("") || message("Tidak ada job aktif.")}</div></section>
    <section id="tab-history" class="panel tab hidden"><h2>Job History</h2><div class="kpi"><span>Earnings</span><b>${rupiah(dash.earnings)}</b></div><p class="muted">${esc(dash.earning_rule)}</p><br><div class="grid">${dash.job_history.map(j => `<article class="card"><h3>Job #${j.job_id} · ${esc(j.status)}</h3><p>Order #${j.order.id} · Earning ${rupiah(j.order.driver_earning)}</p><button class="btn secondary" onclick="viewDriverJob(${j.job_id})">Detail</button>${timeline(j.order.history)}</article>`).join("")}</div></section>
    <br><div id="driverJobDetail"></div>
  `, notifications);
}
async function takeJob(id) { await api(`/driver/jobs/${id}/take`, {method:"POST"}); driverDashboard(); }
async function completeJob(id) { await api(`/driver/jobs/${id}/complete`, {method:"POST"}); driverDashboard(); }
async function viewDriverJob(id) {
  const box = document.getElementById("driverJobDetail");
  try {
    const j = await api(`/driver/jobs/${id}`);
    box.innerHTML = `<section class="panel"><h2>Detail Job #${j.job_id}</h2><div class="grid cols-2"><div><p><b>Status:</b> ${esc(j.status)}</p><p><b>Order:</b> #${j.order.id} · ${esc(j.order.status)}</p><p><b>Alamat:</b> ${esc(j.order.address_snapshot)}</p></div><div><p><b>Delivery:</b> ${esc(j.order.delivery_method)}</p><p><b>Fee:</b> ${rupiah(j.order.delivery_fee)}</p><p><b>Earning:</b> ${rupiah(j.order.driver_earning)}</p></div></div>${timeline(j.order.history)}</section>`;
    box.scrollIntoView({behavior:"smooth", block:"nearest"});
  } catch (e) { box.innerHTML = message(e.message, "error"); }
}

function adminMetricLabel(key) {
  return ({
    users: "Users",
    stores: "Stores",
    products: "Products",
    orders: "Orders",
    vouchers: "Vouchers",
    promos: "Promos",
    delivery_jobs: "Delivery Jobs",
  })[key] || key;
}

async function adminDashboard() {
  const [dash, analytics, auditLogs, vouchers, promos, orders, users, stores, products, deliveryJobs, notifications] = await Promise.all([api("/admin/dashboard"), api("/admin/analytics"), api("/admin/audit-logs"), api("/admin/vouchers"), api("/admin/promos"), api("/admin/orders"), api("/admin/users"), api("/admin/stores"), api("/admin/products"), api("/admin/delivery-jobs"), api("/notifications")]);
  dashboardShell("Admin Dashboard", `
    <div class="tabs"><button onclick="showTab('monitoring')" class="active">Monitoring</button><button onclick="showTab('analytics')">Analytics</button><button onclick="showTab('discounts')">Discounts</button><button onclick="showTab('overdue')">Overdue</button><button onclick="showTab('audit')">Audit</button><button onclick="showTab('data')">Data</button></div>
    <section id="tab-monitoring" class="panel tab"><h2>Marketplace Monitoring</h2><p class="muted">Tanggal operasional: ${dt(dash.simulated_now)}</p><div class="grid cols-4">${["users","stores","products","orders","vouchers","promos","delivery_jobs"].map(k => `<div class="kpi"><span>${esc(adminMetricLabel(k))}</span><b>${dash[k]}</b></div>`).join("")}</div><br><h3>Status Summary</h3><div class="grid cols-3">${Object.entries(dash.status_summary).map(([k,v]) => `<div class="kpi"><span>${esc(k)}</span><b>${v}</b></div>`).join("")}</div></section>
    <section id="tab-analytics" class="panel tab hidden"><h2>Operational Analytics</h2><div class="grid cols-4">
      <div class="kpi"><span>GMV</span><b>${rupiah(analytics.gross_merchandise_value)}</b></div>
      <div class="kpi"><span>Completed GMV</span><b>${rupiah(analytics.completed_gmv)}</b></div>
      <div class="kpi"><span>PPN Total</span><b>${rupiah(analytics.ppn_total)}</b></div>
      <div class="kpi"><span>Discounts</span><b>${rupiah(analytics.discount_total)}</b></div>
      <div class="kpi"><span>Seller Income</span><b>${rupiah(analytics.seller_income)}</b></div>
      <div class="kpi"><span>Driver Earnings</span><b>${rupiah(analytics.driver_earnings)}</b></div>
      <div class="kpi"><span>Active Orders</span><b>${analytics.active_orders}</b></div>
      <div class="kpi"><span>AOV</span><b>${rupiah(analytics.average_order_value)}</b></div>
    </div><br><h3>Store Performance</h3>${simpleTable(analytics.store_performance)}<br><h3>Low Stock</h3>${analytics.low_stock_products.length ? simpleTable(analytics.low_stock_products) : message("Tidak ada produk low stock.")}</section>
    <section id="tab-discounts" class="panel tab hidden"><h2>Voucher & Promo Management</h2><div class="grid cols-2"><form id="voucherForm" class="grid"><h3>Create Voucher</h3><label>Kode<input name="code" value="NEW25"></label><label>Value<input name="value" type="number" value="25000"></label><label>Expiry Days<input name="expiry_days" type="number" value="30"></label><label>Remaining Usage<input name="remaining_usage" type="number" value="10"></label><button class="btn">Create Voucher</button></form><form id="promoForm" class="grid"><h3>Create Promo</h3><label>Kode<input name="code" value="NEW10"></label><label>Percent<input name="percent" type="number" value="10"></label><label>Expiry Days<input name="expiry_days" type="number" value="30"></label><button class="btn">Create Promo</button></form></div><br><h3>Vouchers</h3>${voucherTable(vouchers)}<br><h3>Promos</h3>${promoTable(promos)}<div id="adminDetailBox"></div></section>
    <section id="tab-overdue" class="panel tab hidden"><h2>Manajemen SLA</h2><p class="muted">SLA: Instant 1 hari, Next Day 2 hari, Regular 4 hari. Sistem dapat memproses pengembalian dan refund untuk pesanan yang melewati batas SLA.</p><div class="actions"><button class="btn" onclick="simulateNextDay()">Proses Hari Berikutnya</button><button class="btn secondary" onclick="runOverdue()">Cek SLA Pengiriman</button></div><br><h3>Pesanan Melewati SLA</h3>${ordersList(dash.overdue_orders)}</section>
    <section id="tab-audit" class="panel tab hidden"><h2>Audit Trail</h2>${auditTable(auditLogs)}</section>
    <section id="tab-data" class="panel tab hidden"><h2>Data Operasional</h2><h3>Users</h3>${simpleTable(users)}<br><h3>Stores</h3>${simpleTable(stores)}<br><h3>Products</h3>${simpleTable(products)}<br><h3>Delivery Jobs</h3>${simpleTable(deliveryJobs)}<br><h3>Orders</h3>${ordersList(orders)}</section>
  `, notifications);
  document.getElementById("voucherForm").onsubmit = async e => { e.preventDefault(); const d=formData(e.target); d.value=Number(d.value); d.expiry_days=Number(d.expiry_days); d.remaining_usage=Number(d.remaining_usage); await api("/admin/vouchers", {method:"POST", body:JSON.stringify(d)}); adminDashboard(); };
  document.getElementById("promoForm").onsubmit = async e => { e.preventDefault(); const d=formData(e.target); d.percent=Number(d.percent); d.expiry_days=Number(d.expiry_days); await api("/admin/promos", {method:"POST", body:JSON.stringify(d)}); adminDashboard(); };
}
function voucherTable(rows) { return `<div class="table-wrap"><table><tr><th>Kode</th><th>Value</th><th>Expiry</th><th>Usage</th><th>Aksi</th></tr>${rows.map(v => `<tr><td>${esc(v.code)}</td><td>${rupiah(v.value)}</td><td>${dt(v.expiry_date)}</td><td>${v.remaining_usage}</td><td><button class="btn secondary" onclick="showAdminResource('/admin/vouchers/${v.id}', 'Voucher ${esc(v.code)}')">Detail</button></td></tr>`).join("")}</table></div>`; }
function promoTable(rows) { return `<div class="table-wrap"><table><tr><th>Kode</th><th>Percent</th><th>Expiry</th><th>Aksi</th></tr>${rows.map(p => `<tr><td>${esc(p.code)}</td><td>${p.percent}%</td><td>${dt(p.expiry_date)}</td><td><button class="btn secondary" onclick="showAdminResource('/admin/promos/${p.id}', 'Promo ${esc(p.code)}')">Detail</button></td></tr>`).join("")}</table></div>`; }
function tableCell(value) {
  if (Array.isArray(value)) return `${value.length} item`;
  if (value && typeof value === "object") return Object.entries(value).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === "object" ? "[data]" : v}`).join(", ");
  return value ?? "-";
}
function simpleTable(rows) { if(!rows.length) return message("Kosong."); const keys = Object.keys(rows[0]).slice(0,6); return `<div class="table-wrap"><table><tr>${keys.map(k=>`<th>${esc(k)}</th>`).join("")}</tr>${rows.map(r=>`<tr>${keys.map(k=>`<td>${esc(tableCell(r[k]))}</td>`).join("")}</tr>`).join("")}</table></div>`; }
function auditTable(rows) { return `<div class="table-wrap"><table><tr><th>Waktu</th><th>Aktor</th><th>Role</th><th>Action</th><th>Entity</th><th>Detail</th></tr>${rows.map(a => `<tr><td>${dt(a.created_at)}</td><td>${esc(a.actor?.username || "system")}</td><td>${esc(a.actor?.active_role || "-")}</td><td>${esc(a.action)}</td><td>${esc(a.entity_type)} #${esc(a.entity_id || "-")}</td><td>${esc(JSON.stringify(a.details || {}))}</td></tr>`).join("") || `<tr><td colspan="6">Kosong.</td></tr>`}</table></div>`; }
async function showAdminResource(path, title) {
  const box = document.getElementById("adminDetailBox");
  try {
    const data = await api(path);
    box.innerHTML = `<br><div class="panel"><h3>${esc(title)}</h3><pre class="json-box">${esc(JSON.stringify(data, null, 2))}</pre></div>`;
    box.scrollIntoView({behavior:"smooth", block:"nearest"});
  } catch (e) { box.innerHTML = message(e.message, "error"); }
}
async function simulateNextDay() { const r = await api("/admin/simulate-next-day", {method:"POST"}); alert(`${r.message}. Overdue handled: ${r.overdue_handled.join(", ") || "none"}`); adminDashboard(); }
async function runOverdue() { const r = await api("/admin/run-overdue-check", {method:"POST"}); alert(`${r.message}. Overdue handled: ${r.overdue_handled.join(", ") || "none"}`); adminDashboard(); }

async function route() {
  await refreshMe();
  const hash = location.hash || "#/";
  try {
    if (hash === "#/" || hash === "#") return pageHome();
    if (hash === "#/products") return pageProducts();
    if (hash.startsWith("#/products/")) return pageProductDetail(hash.split("/").pop());
    if (hash.startsWith("#/stores/")) return pageStoreDetail(hash.split("/").pop());
    if (hash === "#/login") return pageLogin();
    if (hash === "#/register") return pageRegister();
    if (hash === "#/reviews") return pageReviews();
    if (hash === "#/choose-role") return pageChooseRole();
    if (hash === "#/dashboard") return pageDashboard();
    if (hash.startsWith("#/orders/")) return pageOrderDetail(hash.split("/").pop());
    setView(message("Halaman tidak ditemukan.", "error"));
  } catch (err) {
    setView(message(err.message, "error"));
  }
}
window.addEventListener("hashchange", route);
route();
