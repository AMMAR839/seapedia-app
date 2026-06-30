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
    <section class="hero">
      <div class="hero-card">
        <h1>Marketplace multi-role yang siap didemokan.</h1>
        <p>SEAPEDIA menghubungkan Buyer, Seller, Driver, dan Admin dalam satu alur transaksi. Guest bisa melihat katalog. User bisa memilih active role dan masuk ke dashboard sesuai hak aksesnya.</p>
        <div class="actions"><a class="btn" href="#/products">Lihat Produk</a><a class="btn ghost" href="#/register">Mulai Akun Demo</a></div>
      </div>
      <div class="panel">
        <h2>Core flow</h2>
        <p class="muted">Checkout memakai single-store cart, diskon Voucher atau Promo, PPN 12%, status history, seller processing, driver delivery, admin monitoring, dan overdue refund.</p>
        <div class="stats">
          <div class="stat"><b>${products.length}</b>Produk</div>
          <div class="stat"><b>${reviews.length}</b>Review</div>
          <div class="stat"><b>4</b>Role</div>
        </div>
      </div>
    </section>
    <section class="grid cols-2">
      <div class="panel"><h2>Produk terbaru</h2><div class="grid">${products.slice(0,3).map(productCard).join("")}</div></div>
      <div class="panel"><h2>Review aplikasi</h2><div class="grid">${reviews.slice(0,4).map(reviewCard).join("")}</div><br><a class="btn secondary" href="#/reviews">Tulis Review</a></div>
    </section>
  `);
}

function productCard(p) {
  return `<article class="card">
    <span class="badge">${esc(p.store.name)}</span>
    <h3>${esc(p.name)}</h3>
    <p class="muted">${esc(p.description)}</p>
    <div class="price">${rupiah(p.price)}</div>
    <div class="muted">Stok: ${p.stock}</div>
    <div class="actions"><a class="btn secondary" href="#/products/${p.id}">Detail</a>${state.user?.active_role === "Buyer" ? `<button class="btn" onclick="quickAdd(${p.id})">Tambah Cart</button>` : ""}</div>
  </article>`;
}

function reviewCard(r) {
  return `<article class="card"><b>${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</b><h3>${esc(r.reviewer_name)}</h3><p>${esc(r.comment)}</p><small class="muted">${dt(r.created_at)}</small></article>`;
}

async function pageProducts() {
  const products = await api("/products");
  state.products = products;
  setView(`
    <section class="panel">
      <h2>Katalog Publik</h2>
      <p class="muted">Guest boleh melihat produk dan detail. Checkout hanya muncul saat active role adalah Buyer.</p>
    </section><br>
    <section class="grid cols-3">${products.map(productCard).join("")}</section>
  `);
}

async function pageProductDetail(id) {
  const p = await api(`/products/${id}`);
  setView(`
    <section class="grid cols-2">
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
        <div class="notice">SEAPEDIA adalah marketplace multi-seller. Cart hanya boleh berisi produk dari satu toko.</div>
      </div>
    </section>
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
    <section class="panel" style="max-width:560px;margin:auto">
      <h1>Login</h1>
      <p class="muted">Gunakan demo account dari README atau akun yang dibuat sendiri.</p>
      <form id="loginForm" class="grid">
        <label>Username<input name="username" required value="buyer"></label>
        <label>Password<input name="password" type="password" required value="Buyer123"></label>
        <button class="btn">Login</button>
      </form>
      <div id="loginMsg"></div>
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

function pageRegister() {
  setView(`
    <section class="panel" style="max-width:700px;margin:auto">
      <h1>Register</h1>
      <p class="muted">Satu username non-admin boleh punya lebih dari satu role.</p>
      <form id="registerForm" class="form-grid">
        <label>Username<input name="username" required placeholder="furqon"></label>
        <label>Email<input name="email" type="email" required placeholder="user@seapedia.test"></label>
        <label>Password<input name="password" type="password" required minlength="6"></label>
        <label>Roles<select name="roles" multiple size="3"><option selected>Buyer</option><option>Seller</option><option>Driver</option></select></label>
        <button class="btn full">Register</button>
      </form>
      <div id="regMsg"></div>
    </section>
  `);
  document.getElementById("registerForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const roles = [...e.target.roles.selectedOptions].map(o => o.value);
    const payload = { username: fd.get("username"), email: fd.get("email"), password: fd.get("password"), roles };
    const msg = document.getElementById("regMsg");
    try {
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
        <h1>Review Aplikasi</h1>
        <p class="muted">Review ini untuk pengalaman aplikasi, bukan review produk. Guest boleh mengirim review.</p>
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

function dashboardShell(title, body) {
  setView(`
    <section class="panel">
      <div class="actions" style="justify-content:space-between;align-items:center">
        <div><h1>${esc(title)}</h1><p class="muted">Role aktif: <b>${esc(state.user?.active_role)}</b>. Roles owned: ${esc((state.user?.roles || []).join(", "))}</p></div>
        ${(state.user?.roles || []).length > 1 ? `<a class="btn secondary" href="#/choose-role">Ganti Role</a>` : ""}
      </div>
    </section><br>${body}
  `);
}

async function buyerDashboard() {
  const [wallet, addresses, cart, orders, report] = await Promise.all([
    api("/buyer/wallet"), api("/buyer/addresses"), api("/buyer/cart"), api("/buyer/orders"), api("/buyer/report")
  ]);
  const addressOptions = addresses.map(a => `<option value="${a.id}">${esc(a.recipient_name)} · ${esc(a.full_address)}</option>`).join("");
  dashboardShell("Buyer Dashboard", `
    <div class="tabs"><button onclick="showTab('wallet')" class="active">Wallet</button><button onclick="showTab('address')">Address</button><button onclick="showTab('cart')">Cart & Checkout</button><button onclick="showTab('orders')">Orders</button></div>
    <section id="tab-wallet" class="panel tab"><h2>Wallet</h2><div class="kpi"><span>Balance</span><b>${rupiah(wallet.balance)}</b></div><br>
      <form id="topupForm" class="form-grid"><label>Nominal top-up<input name="amount" type="number" min="1" value="500000"></label><button class="btn">Top Up Dummy</button></form><br>${txTable(wallet.transactions)}</section>
    <section id="tab-address" class="panel tab hidden"><h2>Delivery Address</h2><form id="addrForm" class="form-grid"><label>Penerima<input name="recipient_name" required></label><label>Telepon<input name="phone" required></label><label class="full">Alamat<textarea name="full_address" required></textarea></label><button class="btn full">Simpan Alamat</button></form><br>${addressTable(addresses)}</section>
    <section id="tab-cart" class="panel tab hidden"><h2>Cart</h2><div class="notice">Single-store checkout: cart hanya boleh berisi produk dari satu toko. Jika ingin belanja toko lain, kosongkan cart dulu.</div><br>${cartTable(cart)}<br>
      <form id="checkoutForm" class="form-grid"><label>Alamat<select name="address_id" required>${addressOptions}</select></label><label>Delivery<select name="delivery_method"><option>Instant</option><option>Next Day</option><option>Regular</option></select></label><label>Voucher/Promo<input name="discount_code" placeholder="HEMAT25 atau PROMO10"></label><div class="actions"><button class="btn secondary" type="button" onclick="checkoutSummary()">Lihat Summary</button><button class="btn">Checkout</button></div></form><div id="checkoutResult"></div></section>
    <section id="tab-orders" class="panel tab hidden"><h2>Order History</h2><div class="grid cols-2"><div class="kpi"><span>Total Spending</span><b>${rupiah(report.spending)}</b></div><div class="kpi"><span>Refunded</span><b>${rupiah(report.returned_or_refunded)}</b></div></div><br>${ordersList(orders)}</section>
  `);
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
function ordersList(orders) { return `<div class="grid">${orders.map(o => `<article class="card"><h3>Order #${o.id} · ${esc(o.status)}</h3><p>${esc(o.delivery_method)} · Final ${rupiah(o.final_total)} · Diskon ${rupiah(o.discount)} · PPN ${rupiah(o.ppn)}</p><div>${o.items.map(i => `<span class="badge">${esc(i.product_name)} x${i.quantity}</span>`).join(" ")}</div>${timeline(o.history)}</article>`).join("") || message("Belum ada order.")}</div>`; }
function timeline(history) { return `<div class="timeline">${(history || []).map(h => `<div class="timeline-item"><b>${esc(h.status)}</b><span>${esc(h.note)}<br><small class="muted">${dt(h.created_at)}</small></span></div>`).join("")}</div>`; }

async function sellerDashboard() {
  const [store, products, orders, report] = await Promise.all([api("/seller/store"), api("/seller/products"), api("/seller/orders"), api("/seller/report")]);
  dashboardShell("Seller Dashboard", `
    <div class="tabs"><button onclick="showTab('store')" class="active">Store</button><button onclick="showTab('products')">Products</button><button onclick="showTab('orders')">Orders</button><button onclick="showTab('report')">Report</button></div>
    <section id="tab-store" class="panel tab"><h2>Store Management</h2><form id="storeForm" class="form-grid"><label>Nama Store<input name="name" required value="${esc(store?.name || "")}"></label><label class="full">Deskripsi<textarea name="description">${esc(store?.description || "")}</textarea></label><button class="btn full">Simpan Store</button></form></section>
    <section id="tab-products" class="panel tab hidden"><h2>Product CRUD</h2><form id="productForm" class="form-grid"><input type="hidden" name="id"><label>Nama Produk<input name="name" required></label><label>Harga<input name="price" type="number" min="1" required></label><label>Stok<input name="stock" type="number" min="0" required></label><label class="full">Deskripsi<textarea name="description"></textarea></label><button class="btn full">Simpan Produk</button></form><br>${sellerProductTable(products)}</section>
    <section id="tab-orders" class="panel tab hidden"><h2>Incoming Orders</h2>${sellerOrdersTable(orders)}</section>
    <section id="tab-report" class="panel tab hidden"><h2>Income Report</h2><div class="grid cols-3"><div class="kpi"><span>Income</span><b>${rupiah(report.income)}</b></div><div class="kpi"><span>Completed</span><b>${report.completed_orders}</b></div><div class="kpi"><span>Returned</span><b>${report.returned_orders}</b></div></div><p class="muted">${esc(report.income_rule)}</p></section>
  `);
  document.getElementById("storeForm").onsubmit = async e => { e.preventDefault(); await api("/seller/store", {method:"POST", body:JSON.stringify(formData(e.target))}); sellerDashboard(); };
  document.getElementById("productForm").onsubmit = async e => { e.preventDefault(); const d = formData(e.target); const id = d.id; delete d.id; d.price = Number(d.price); d.stock = Number(d.stock); await api(id ? `/seller/products/${id}` : "/seller/products", {method:id ? "PUT" : "POST", body:JSON.stringify(d)}); sellerDashboard(); };
}
function sellerProductTable(products) { return `<div class="table-wrap"><table><tr><th>ID</th><th>Produk</th><th>Harga</th><th>Stok</th><th>Aksi</th></tr>${products.map(p => `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${rupiah(p.price)}</td><td>${p.stock}</td><td><button class="btn secondary" onclick='editProduct(${JSON.stringify(p).replaceAll("'","&#39;")})'>Edit</button> <button class="btn danger" onclick="deleteProduct(${p.id})">Delete</button></td></tr>`).join("")}</table></div>`; }
function editProduct(p) { const f = document.getElementById("productForm"); f.id.value = p.id; f.name.value = p.name; f.price.value = p.price; f.stock.value = p.stock; f.description.value = p.description; window.scrollTo({top:f.offsetTop-80, behavior:"smooth"}); }
async function deleteProduct(id) { if(confirm("Hapus produk?")) { await api(`/seller/products/${id}`, {method:"DELETE"}); sellerDashboard(); } }
function sellerOrdersTable(orders) { return `<div class="grid">${orders.map(o => `<article class="card"><h3>Order #${o.id} · ${esc(o.status)}</h3><p>Final ${rupiah(o.final_total)} · Delivery ${esc(o.delivery_method)}</p><div class="actions">${o.status === "Sedang Dikemas" ? `<button class="btn" onclick="processOrder(${o.id})">Process to Menunggu Pengirim</button>` : ""}</div>${timeline(o.history)}</article>`).join("") || message("Belum ada order masuk.")}</div>`; }
async function processOrder(id) { await api(`/seller/orders/${id}/process`, {method:"POST"}); sellerDashboard(); }

async function driverDashboard() {
  const [available, dash] = await Promise.all([api("/driver/jobs/available"), api("/driver/dashboard")]);
  dashboardShell("Driver Dashboard", `
    <div class="tabs"><button onclick="showTab('available')" class="active">Available Jobs</button><button onclick="showTab('active')">Active</button><button onclick="showTab('history')">History & Earnings</button></div>
    <section id="tab-available" class="panel tab"><h2>Available Jobs</h2><div class="grid">${available.map(j => `<article class="card"><h3>Job #${j.job_id} · Order #${j.order.id}</h3><p>${esc(j.order.delivery_method)} · Fee ${rupiah(j.order.delivery_fee)} · ${esc(j.order.address_snapshot)}</p><button class="btn" onclick="takeJob(${j.job_id})">Take Job</button></article>`).join("") || message("Belum ada job tersedia. Seller harus process order dulu.")}</div></section>
    <section id="tab-active" class="panel tab hidden"><h2>Active Job</h2><div class="grid">${dash.active_jobs.map(j => `<article class="card"><h3>Job #${j.job_id} · Order #${j.order.id}</h3><p>Status ${esc(j.order.status)} · Fee ${rupiah(j.order.delivery_fee)}</p><button class="btn" onclick="completeJob(${j.job_id})">Confirm Completed</button></article>`).join("") || message("Tidak ada job aktif.")}</div></section>
    <section id="tab-history" class="panel tab hidden"><h2>Job History</h2><div class="kpi"><span>Earnings</span><b>${rupiah(dash.earnings)}</b></div><p class="muted">${esc(dash.earning_rule)}</p><br><div class="grid">${dash.job_history.map(j => `<article class="card"><h3>Job #${j.job_id} · ${esc(j.status)}</h3><p>Order #${j.order.id} · Earning ${rupiah(j.order.driver_earning)}</p>${timeline(j.order.history)}</article>`).join("")}</div></section>
  `);
}
async function takeJob(id) { await api(`/driver/jobs/${id}/take`, {method:"POST"}); driverDashboard(); }
async function completeJob(id) { await api(`/driver/jobs/${id}/complete`, {method:"POST"}); driverDashboard(); }

async function adminDashboard() {
  const [dash, vouchers, promos, orders, users, stores] = await Promise.all([api("/admin/dashboard"), api("/admin/vouchers"), api("/admin/promos"), api("/admin/orders"), api("/admin/users"), api("/admin/stores")]);
  dashboardShell("Admin Dashboard", `
    <div class="tabs"><button onclick="showTab('monitoring')" class="active">Monitoring</button><button onclick="showTab('discounts')">Discounts</button><button onclick="showTab('overdue')">Overdue</button><button onclick="showTab('data')">Data</button></div>
    <section id="tab-monitoring" class="panel tab"><h2>Marketplace Monitoring</h2><p class="muted">Simulated now: ${dt(dash.simulated_now)}</p><div class="grid cols-4">${["users","stores","products","orders","vouchers","promos","delivery_jobs"].map(k => `<div class="kpi"><span>${k}</span><b>${dash[k]}</b></div>`).join("")}</div><br><h3>Status Summary</h3><div class="grid cols-3">${Object.entries(dash.status_summary).map(([k,v]) => `<div class="kpi"><span>${esc(k)}</span><b>${v}</b></div>`).join("")}</div></section>
    <section id="tab-discounts" class="panel tab hidden"><h2>Voucher & Promo Management</h2><div class="grid cols-2"><form id="voucherForm" class="grid"><h3>Create Voucher</h3><label>Kode<input name="code" value="NEW25"></label><label>Value<input name="value" type="number" value="25000"></label><label>Expiry Days<input name="expiry_days" type="number" value="30"></label><label>Remaining Usage<input name="remaining_usage" type="number" value="10"></label><button class="btn">Create Voucher</button></form><form id="promoForm" class="grid"><h3>Create Promo</h3><label>Kode<input name="code" value="NEW10"></label><label>Percent<input name="percent" type="number" value="10"></label><label>Expiry Days<input name="expiry_days" type="number" value="30"></label><button class="btn">Create Promo</button></form></div><br><h3>Vouchers</h3>${voucherTable(vouchers)}<br><h3>Promos</h3>${promoTable(promos)}</section>
    <section id="tab-overdue" class="panel tab hidden"><h2>Overdue Handling</h2><p class="muted">SLA: Instant 1 hari, Next Day 2 hari, Regular 4 hari. Klik simulasi untuk maju satu hari dan menjalankan auto return/refund.</p><div class="actions"><button class="btn" onclick="simulateNextDay()">Simulate Next Day</button><button class="btn secondary" onclick="runOverdue()">Run Overdue Check</button></div><br><h3>Overdue Orders</h3>${ordersList(dash.overdue_orders)}</section>
    <section id="tab-data" class="panel tab hidden"><h2>Raw Monitoring Data</h2><h3>Users</h3>${simpleTable(users)}<br><h3>Stores</h3>${simpleTable(stores)}<br><h3>Orders</h3>${ordersList(orders)}</section>
  `);
  document.getElementById("voucherForm").onsubmit = async e => { e.preventDefault(); const d=formData(e.target); d.value=Number(d.value); d.expiry_days=Number(d.expiry_days); d.remaining_usage=Number(d.remaining_usage); await api("/admin/vouchers", {method:"POST", body:JSON.stringify(d)}); adminDashboard(); };
  document.getElementById("promoForm").onsubmit = async e => { e.preventDefault(); const d=formData(e.target); d.percent=Number(d.percent); d.expiry_days=Number(d.expiry_days); await api("/admin/promos", {method:"POST", body:JSON.stringify(d)}); adminDashboard(); };
}
function voucherTable(rows) { return `<div class="table-wrap"><table><tr><th>Kode</th><th>Value</th><th>Expiry</th><th>Usage</th></tr>${rows.map(v => `<tr><td>${esc(v.code)}</td><td>${rupiah(v.value)}</td><td>${dt(v.expiry_date)}</td><td>${v.remaining_usage}</td></tr>`).join("")}</table></div>`; }
function promoTable(rows) { return `<div class="table-wrap"><table><tr><th>Kode</th><th>Percent</th><th>Expiry</th></tr>${rows.map(p => `<tr><td>${esc(p.code)}</td><td>${p.percent}%</td><td>${dt(p.expiry_date)}</td></tr>`).join("")}</table></div>`; }
function simpleTable(rows) { if(!rows.length) return message("Kosong."); const keys = Object.keys(rows[0]).slice(0,6); return `<div class="table-wrap"><table><tr>${keys.map(k=>`<th>${esc(k)}</th>`).join("")}</tr>${rows.map(r=>`<tr>${keys.map(k=>`<td>${esc(Array.isArray(r[k]) ? r[k].join(",") : r[k])}</td>`).join("")}</tr>`).join("")}</table></div>`; }
async function simulateNextDay() { const r = await api("/admin/simulate-next-day", {method:"POST"}); alert(`${r.message}. Overdue handled: ${r.overdue_handled.join(", ") || "none"}`); adminDashboard(); }
async function runOverdue() { const r = await api("/admin/run-overdue-check", {method:"POST"}); alert(`${r.message}. Overdue handled: ${r.overdue_handled.join(", ") || "none"}`); adminDashboard(); }

async function route() {
  await refreshMe();
  const hash = location.hash || "#/";
  try {
    if (hash === "#/" || hash === "#") return pageHome();
    if (hash === "#/products") return pageProducts();
    if (hash.startsWith("#/products/")) return pageProductDetail(hash.split("/").pop());
    if (hash === "#/login") return pageLogin();
    if (hash === "#/register") return pageRegister();
    if (hash === "#/reviews") return pageReviews();
    if (hash === "#/choose-role") return pageChooseRole();
    if (hash === "#/dashboard") return pageDashboard();
    setView(message("Halaman tidak ditemukan.", "error"));
  } catch (err) {
    setView(message(err.message, "error"));
  }
}
window.addEventListener("hashchange", route);
route();
