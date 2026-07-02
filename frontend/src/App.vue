<template>
  <header class="navbar">
    <a class="brand" href="#/">
      <span class="brand-mark">S</span>
      <span>SEAPEDIA</span>
    </a>
    <nav class="nav-links">
      <a class="btn secondary" href="#/">Home</a>
      <a class="btn secondary" href="#/products">Produk</a>
      <template v-if="user">
        <span class="badge">{{ user.username }} · {{ user.active_role || "Pilih role" }}</span>
        <a class="btn secondary" href="#/dashboard">Dashboard</a>
        <button class="danger" type="button" @click="logout">Logout</button>
      </template>
      <template v-else>
        <a class="btn secondary" href="#/login">Login</a>
        <a class="btn" href="#/register">Register</a>
      </template>
    </nav>
  </header>

  <main class="container">
    <div v-if="loading" class="notice">Memuat data...</div>
    <div v-if="error" class="notice error">{{ error }}</div>

    <template v-if="!loading">
      <section v-if="page === 'home'">
        <section class="hero-visual">
          <div class="hero-copy">
            <h1>Marketplace terpadu untuk belanja dan operasional toko.</h1>
            <p>SEAPEDIA menghubungkan pembeli, penjual, kurir, dan admin dalam satu alur transaksi yang rapi, mulai dari katalog produk sampai pengiriman dan monitoring pesanan.</p>
            <div class="actions">
              <a class="btn" href="#/products">Lihat Produk</a>
              <a class="btn ghost" href="#/register">Buat Akun</a>
            </div>
            <div class="stats">
              <div class="stat"><b>{{ products.length }}</b>Produk</div>
              <div class="stat"><b>{{ storeCount }}</b>Toko</div>
              <div class="stat"><b>4</b>Role</div>
            </div>
          </div>
        </section>

        <section class="panel latest-products-panel">
          <div class="actions latest-products-heading">
            <h2>Produk terbaru</h2>
            <a class="btn secondary" href="#/products">Lihat Semua</a>
          </div>
          <div class="latest-products-grid">
            <article v-for="product in latestProducts" :key="product.id" class="card latest-product-card">
              <figure class="product-media latest">
                <img :src="productImage(product)" :alt="`Ilustrasi ${product.name}`" loading="eager">
              </figure>
              <div class="latest-product-body">
                <a class="badge" :href="`#/stores/${product.store?.id}`">{{ product.store?.name }}</a>
                <h3>{{ product.name }}</h3>
                <p class="muted">{{ product.description }}</p>
                <div class="price">{{ rupiah(product.price) }}</div>
                <a class="btn secondary" :href="`#/products/${product.id}`">Detail</a>
              </div>
            </article>
          </div>
        </section>
      </section>

      <section v-else-if="page === 'products'">
        <section class="panel">
          <h2>Katalog Publik</h2>
          <p class="muted">Pengunjung dapat melihat katalog dan detail produk. Checkout tersedia setelah masuk sebagai Buyer.</p>
          <form class="form-grid" @submit.prevent="applyCatalogFilter">
            <label>Pencarian<input v-model.trim="catalogFilter.q" placeholder="Cari produk atau toko"></label>
            <label>Toko
              <select v-model="catalogFilter.store_id">
                <option value="">Semua toko</option>
                <option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
              </select>
            </label>
            <label>Harga Minimum<input v-model.number="catalogFilter.min_price" type="number" min="0" placeholder="0"></label>
            <label>Harga Maksimum<input v-model.number="catalogFilter.max_price" type="number" min="0" placeholder="200000"></label>
            <label>Urutkan
              <select v-model="catalogFilter.sort">
                <option value="newest">Terbaru</option>
                <option value="price_asc">Harga Terendah</option>
                <option value="price_desc">Harga Tertinggi</option>
                <option value="stock_desc">Stok Terbanyak</option>
                <option value="name_asc">Nama Produk</option>
              </select>
            </label>
            <label><span>Ketersediaan</span>
              <select v-model="catalogFilter.in_stock">
                <option value="">Semua</option>
                <option value="true">Stok tersedia</option>
              </select>
            </label>
            <button class="btn full">Terapkan Filter</button>
          </form>
        </section>

        <section class="notice">{{ products.length }} produk ditemukan.</section>
        <section class="product-list">
          <article v-for="product in products" :key="product.id" class="card product-card">
            <figure class="product-media thumb">
              <img :src="productImage(product)" :alt="`Ilustrasi ${product.name}`" loading="lazy">
            </figure>
            <div class="product-card-body">
              <a class="badge" :href="`#/stores/${product.store?.id}`">{{ product.store?.name }}</a>
              <h3>{{ product.name }}</h3>
              <p class="muted">{{ product.description }}</p>
              <div class="price">{{ rupiah(product.price) }}</div>
              <div class="muted">Stok: {{ product.stock }}</div>
            </div>
            <div class="actions">
              <a class="btn secondary" :href="`#/products/${product.id}`">Detail</a>
              <button v-if="user?.active_role === 'Buyer'" class="btn" type="button" @click="quickAdd(product.id)">Tambah Cart</button>
            </div>
          </article>
          <div v-if="products.length === 0" class="notice">Tidak ada produk sesuai filter.</div>
        </section>
      </section>

      <section v-else-if="page === 'product-detail' && selectedProduct" class="grid cols-2">
        <div class="panel product-detail-visual">
          <figure class="product-media detail">
            <img :src="productImage(selectedProduct)" :alt="`Ilustrasi ${selectedProduct.name}`">
          </figure>
        </div>
        <div class="panel">
          <span class="badge">{{ selectedProduct.store?.name }}</span>
          <h1>{{ selectedProduct.name }}</h1>
          <p>{{ selectedProduct.description }}</p>
          <div class="price">{{ rupiah(selectedProduct.price) }}</div>
          <p class="muted">Stok tersedia: {{ selectedProduct.stock }}</p>
          <div class="actions">
            <button v-if="user?.active_role === 'Buyer'" class="btn" type="button" @click="quickAdd(selectedProduct.id)">Tambah ke Cart</button>
            <a v-else class="btn secondary" href="#/login">Login sebagai Buyer untuk checkout</a>
            <a class="btn secondary" href="#/products">Kembali</a>
          </div>
        </div>
        <div class="panel">
          <h2>Informasi Store</h2>
          <p><b>{{ selectedProduct.store?.name }}</b></p>
          <p class="muted">{{ selectedProduct.store?.description }}</p>
          <a class="btn secondary" :href="`#/stores/${selectedProduct.store?.id}`">Lihat Store</a>
        </div>
      </section>

      <section v-else-if="page === 'store-detail' && selectedStore">
        <section class="panel">
          <div class="actions spread">
            <div>
              <h1>{{ selectedStore.name }}</h1>
              <p class="muted">{{ selectedStore.description }}</p>
            </div>
            <a class="btn secondary" href="#/products">Kembali ke Katalog</a>
          </div>
        </section>
        <section class="grid cols-3 metric-row">
          <div class="kpi"><span>Products</span><b>{{ selectedStore.product_count }}</b></div>
          <div class="kpi"><span>Completed Orders</span><b>{{ selectedStore.completed_orders }}</b></div>
          <div class="kpi"><span>Income</span><b>{{ rupiah(selectedStore.income) }}</b></div>
        </section>
        <section class="product-list">
          <article v-for="product in selectedStore.products" :key="product.id" class="card product-card">
            <figure class="product-media thumb">
              <img :src="productImage(product)" :alt="`Ilustrasi ${product.name}`">
            </figure>
            <div class="product-card-body">
              <span class="badge">{{ selectedStore.name }}</span>
              <h3>{{ product.name }}</h3>
              <p class="muted">{{ product.description }}</p>
              <div class="price">{{ rupiah(product.price) }}</div>
              <div class="muted">Stok: {{ product.stock }}</div>
            </div>
            <div class="actions">
              <a class="btn secondary" :href="`#/products/${product.id}`">Detail</a>
            </div>
          </article>
        </section>
      </section>

      <section v-else-if="page === 'login'" class="auth-layout">
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
          <form class="auth-form" @submit.prevent="login">
            <label>Username<input v-model.trim="loginForm.username" required autocomplete="username" placeholder="Username"></label>
            <label>Password
              <div class="input-action">
                <input v-model="loginForm.password" :type="showLoginPassword ? 'text' : 'password'" required autocomplete="current-password" placeholder="Password">
                <button class="mini-btn" type="button" @click="showLoginPassword = !showLoginPassword">{{ showLoginPassword ? "Hide" : "Show" }}</button>
              </div>
            </label>
            <button class="btn full">Login</button>
          </form>
          <p class="muted auth-switch">Belum punya akun? <a href="#/register">Register akun baru</a></p>
          <div v-if="authMessage" class="notice error">{{ authMessage }}</div>
        </section>
      </section>

      <section v-else-if="page === 'register'" class="auth-layout">
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
          <form class="auth-form" @submit.prevent="register">
            <div class="form-grid">
              <label>Username<input v-model.trim="registerForm.username" required autocomplete="username" placeholder="Username"></label>
              <label>Email<input v-model.trim="registerForm.email" type="email" required autocomplete="email" placeholder="nama@seapedia.id"></label>
            </div>
            <label>Password
              <div class="input-action">
                <input v-model="registerForm.password" :type="showRegisterPassword ? 'text' : 'password'" required minlength="6" autocomplete="new-password" placeholder="Minimal 6 karakter">
                <button class="mini-btn" type="button" @click="showRegisterPassword = !showRegisterPassword">{{ showRegisterPassword ? "Hide" : "Show" }}</button>
              </div>
            </label>
            <fieldset class="role-options">
              <legend>Role akun</legend>
              <label v-for="role in publicRoles" :key="role.value">
                <input v-model="registerForm.roles" type="checkbox" name="roles" :value="role.value">
                <span><b>{{ role.value }}</b><small>{{ role.description }}</small></span>
              </label>
            </fieldset>
            <button class="btn full">Buat Akun</button>
          </form>
          <p class="muted auth-switch">Sudah punya akun? <a href="#/login">Login di sini</a></p>
          <div v-if="authMessage" class="notice error">{{ authMessage }}</div>
        </section>
      </section>

      <section v-else-if="page === 'choose-role'" class="panel role-picker">
        <h1>Pilih Active Role</h1>
        <p class="muted">Authorization backend mengikuti active role ini, bukan hanya daftar role yang dimiliki.</p>
        <div class="grid cols-3">
          <button v-for="role in user?.roles || []" :key="role" class="btn" type="button" @click="chooseRole(role)">{{ role }}</button>
        </div>
      </section>

      <section v-else-if="page === 'dashboard'">
        <section class="panel">
          <div class="actions spread">
            <div>
              <h1>{{ user?.active_role }} Dashboard</h1>
              <p class="muted">Role aktif: <b>{{ user?.active_role }}</b>. Roles owned: {{ (user?.roles || []).join(", ") }}</p>
            </div>
            <a v-if="(user?.roles || []).length > 1" class="btn secondary" href="#/choose-role">Ganti Role</a>
          </div>
        </section>

        <section class="panel notification-panel">
          <div class="actions spread">
            <h2>Notifications <span class="badge">{{ dashboard.notifications.unread_count || 0 }} unread</span></h2>
            <button class="btn secondary" type="button" @click="markNotificationsRead">Mark Read</button>
          </div>
          <div v-if="dashboard.notifications.items.length" class="grid">
            <article v-for="item in dashboard.notifications.items.slice(0, 5)" :key="item.id" class="card" :class="{ unread: !item.read }">
              <div class="actions spread">
                <b>{{ item.title }}</b>
                <small class="muted">{{ dt(item.created_at) }}</small>
              </div>
              <p>{{ item.message }}</p>
            </article>
          </div>
          <div v-else class="notice">Tidak ada notifikasi untuk role aktif.</div>
        </section>

        <section v-if="user?.active_role === 'Buyer'" class="dashboard-stack">
          <div class="tabs">
            <button :class="{ active: activeTab === 'wallet' }" @click="activeTab = 'wallet'">Wallet</button>
            <button :class="{ active: activeTab === 'address' }" @click="activeTab = 'address'">Address</button>
            <button :class="{ active: activeTab === 'cart' }" @click="activeTab = 'cart'">Cart & Checkout</button>
            <button :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'">Orders</button>
          </div>

          <section v-show="activeTab === 'wallet'" class="panel">
            <h2>Wallet</h2>
            <div class="kpi"><span>Balance</span><b>{{ rupiah(dashboard.buyer.wallet.balance) }}</b></div>
            <form class="form-grid compact-form" @submit.prevent="topupWallet">
              <label>Nominal top-up<input v-model.number="buyerForms.topupAmount" type="number" min="1"></label>
              <button class="btn">Top Up Saldo</button>
            </form>
            <DataTable :rows="dashboard.buyer.wallet.transactions" :columns="['kind', 'amount', 'note', 'created_at']" :formatters="tableFormatters" />
          </section>

          <section v-show="activeTab === 'address'" class="panel">
            <h2>Delivery Address</h2>
            <form class="form-grid" @submit.prevent="saveAddress">
              <label>Penerima<input v-model.trim="buyerForms.address.recipient_name" required></label>
              <label>Telepon<input v-model.trim="buyerForms.address.phone" required></label>
              <label class="full">Alamat<textarea v-model.trim="buyerForms.address.full_address" required></textarea></label>
              <button class="btn full">Simpan Alamat</button>
            </form>
            <DataTable :rows="dashboard.buyer.addresses" :columns="['id', 'recipient_name', 'phone', 'full_address']" :formatters="tableFormatters" />
          </section>

          <section v-show="activeTab === 'cart'" class="panel">
            <h2>Cart</h2>
            <div class="notice">Single-store checkout: cart hanya boleh berisi produk dari satu toko. Jika ingin belanja toko lain, kosongkan cart dulu.</div>
            <div v-if="dashboard.buyer.cart.items.length">
              <p><b>Store:</b> {{ dashboard.buyer.cart.store_name }} · <b>Subtotal:</b> {{ rupiah(dashboard.buyer.cart.subtotal) }}</p>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Total</th><th>Aksi</th></tr></thead>
                  <tbody>
                    <tr v-for="item in dashboard.buyer.cart.items" :key="item.cart_item_id">
                      <td>{{ item.product_name }}</td>
                      <td><input class="qty-input" type="number" min="1" :max="item.stock" :value="item.quantity" @change="updateCart(item.cart_item_id, $event.target.value)"></td>
                      <td>{{ rupiah(item.price) }}</td>
                      <td>{{ rupiah(item.line_total) }}</td>
                      <td><button class="btn danger" type="button" @click="deleteCart(item.cart_item_id)">Hapus</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <button class="btn secondary" type="button" @click="clearCart">Kosongkan Cart</button>
            </div>
            <div v-else class="notice">Cart kosong.</div>

            <form class="form-grid compact-form" @submit.prevent="checkout">
              <label>Alamat
                <select v-model.number="buyerForms.checkout.address_id" required>
                  <option disabled value="">Pilih alamat</option>
                  <option v-for="address in dashboard.buyer.addresses" :key="address.id" :value="address.id">{{ address.recipient_name }} · {{ address.full_address }}</option>
                </select>
              </label>
              <label>Delivery
                <select v-model="buyerForms.checkout.delivery_method">
                  <option>Instant</option>
                  <option>Next Day</option>
                  <option>Regular</option>
                </select>
              </label>
              <label>Voucher/Promo<input v-model.trim="buyerForms.checkout.discount_code" placeholder="HEMAT25 atau PROMO10"></label>
              <div class="actions">
                <button class="btn secondary" type="button" @click="checkoutSummary">Lihat Summary</button>
                <button class="btn">Checkout</button>
              </div>
            </form>
            <div v-if="buyerForms.checkoutSummary" class="panel inset-panel">
              <h3>Checkout Summary</h3>
              <p>Subtotal: <b>{{ rupiah(buyerForms.checkoutSummary.subtotal) }}</b></p>
              <p>Discount: <b>{{ rupiah(buyerForms.checkoutSummary.discount) }}</b> {{ buyerForms.checkoutSummary.discount_type || "" }}</p>
              <p>Delivery: <b>{{ rupiah(buyerForms.checkoutSummary.delivery_fee) }}</b></p>
              <p>PPN 12%: <b>{{ rupiah(buyerForms.checkoutSummary.ppn) }}</b></p>
              <h2>Final: {{ rupiah(buyerForms.checkoutSummary.final_total) }}</h2>
              <p class="muted">{{ buyerForms.checkoutSummary.ppn_rule }}</p>
            </div>
            <div v-if="buyerForms.message" class="notice success">{{ buyerForms.message }}</div>
          </section>

          <section v-show="activeTab === 'orders'" class="panel">
            <h2>Order History</h2>
            <div class="grid cols-2 metric-row">
              <div class="kpi"><span>Total Spending</span><b>{{ rupiah(dashboard.buyer.report.spending) }}</b></div>
              <div class="kpi"><span>Refunded</span><b>{{ rupiah(dashboard.buyer.report.returned_or_refunded) }}</b></div>
            </div>
            <OrderCards :orders="dashboard.buyer.orders" :rupiah="rupiah" :dt="dt" />
          </section>
        </section>

        <section v-if="user?.active_role === 'Seller'" class="dashboard-stack">
          <div class="tabs">
            <button :class="{ active: activeTab === 'store' }" @click="activeTab = 'store'">Store</button>
            <button :class="{ active: activeTab === 'products' }" @click="activeTab = 'products'">Products</button>
            <button :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'">Orders</button>
            <button :class="{ active: activeTab === 'report' }" @click="activeTab = 'report'">Report</button>
          </div>

          <section v-show="activeTab === 'store'" class="panel">
            <h2>Store Management</h2>
            <form class="form-grid" @submit.prevent="saveStore">
              <label>Nama Store<input v-model.trim="sellerForms.store.name" required></label>
              <label class="full">Deskripsi<textarea v-model.trim="sellerForms.store.description"></textarea></label>
              <button class="btn full">Simpan Store</button>
            </form>
          </section>

          <section v-show="activeTab === 'products'" class="panel">
            <h2>Product CRUD</h2>
            <form class="form-grid" @submit.prevent="saveSellerProduct">
              <label>Nama Produk<input v-model.trim="sellerForms.product.name" required></label>
              <label>Harga<input v-model.number="sellerForms.product.price" type="number" min="1" required></label>
              <label>Stok<input v-model.number="sellerForms.product.stock" type="number" min="0" required></label>
              <label class="full">Deskripsi<textarea v-model.trim="sellerForms.product.description"></textarea></label>
              <button class="btn full">Simpan Produk</button>
            </form>
            <div class="table-wrap">
              <table>
                <thead><tr><th>ID</th><th>Produk</th><th>Harga</th><th>Stok</th><th>Aksi</th></tr></thead>
                <tbody>
                  <tr v-for="product in dashboard.seller.products" :key="product.id">
                    <td>{{ product.id }}</td>
                    <td>{{ product.name }}</td>
                    <td>{{ rupiah(product.price) }}</td>
                    <td>{{ product.stock }}</td>
                    <td>
                      <button class="btn secondary" type="button" @click="editSellerProduct(product)">Edit</button>
                      <button class="btn danger" type="button" @click="deleteSellerProduct(product.id)">Delete</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section v-show="activeTab === 'orders'" class="panel">
            <h2>Incoming Orders</h2>
            <div class="grid">
              <article v-for="order in dashboard.seller.orders" :key="order.id" class="card">
                <h3>Order #{{ order.id }} · {{ order.status }}</h3>
                <p>Final {{ rupiah(order.final_total) }} · Delivery {{ order.delivery_method }}</p>
                <div class="actions">
                  <button v-if="order.status === 'Sedang Dikemas'" class="btn" type="button" @click="processOrder(order.id)">Process to Menunggu Pengirim</button>
                </div>
                <Timeline :history="order.history" :dt="dt" />
              </article>
              <div v-if="dashboard.seller.orders.length === 0" class="notice">Belum ada order masuk.</div>
            </div>
          </section>

          <section v-show="activeTab === 'report'" class="panel">
            <h2>Income Report</h2>
            <div class="grid cols-3 metric-row">
              <div class="kpi"><span>Income</span><b>{{ rupiah(dashboard.seller.report.income) }}</b></div>
              <div class="kpi"><span>Completed</span><b>{{ dashboard.seller.report.completed_orders || 0 }}</b></div>
              <div class="kpi"><span>Returned</span><b>{{ dashboard.seller.report.returned_orders || 0 }}</b></div>
            </div>
            <p class="muted">{{ dashboard.seller.report.income_rule }}</p>
          </section>
        </section>

        <section v-if="user?.active_role === 'Driver'" class="dashboard-stack">
          <div class="tabs">
            <button :class="{ active: activeTab === 'available' }" @click="activeTab = 'available'">Available Jobs</button>
            <button :class="{ active: activeTab === 'active' }" @click="activeTab = 'active'">Active</button>
            <button :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">History & Earnings</button>
          </div>

          <section v-show="activeTab === 'available'" class="panel">
            <h2>Available Jobs</h2>
            <div class="grid">
              <article v-for="job in dashboard.driver.available" :key="job.job_id" class="card">
                <h3>Job #{{ job.job_id }} · Order #{{ job.order.id }}</h3>
                <p>{{ job.order.delivery_method }} · Fee {{ rupiah(job.order.delivery_fee) }} · {{ job.order.address_snapshot }}</p>
                <div class="actions">
                  <button class="btn secondary" type="button" @click="viewDriverJob(job.job_id)">Detail</button>
                  <button class="btn" type="button" @click="takeJob(job.job_id)">Take Job</button>
                </div>
              </article>
              <div v-if="dashboard.driver.available.length === 0" class="notice">Belum ada job tersedia. Seller harus process order dulu.</div>
            </div>
          </section>

          <section v-show="activeTab === 'active'" class="panel">
            <h2>Active Job</h2>
            <div class="grid">
              <article v-for="job in dashboard.driver.dashboard.active_jobs" :key="job.job_id" class="card">
                <h3>Job #{{ job.job_id }} · Order #{{ job.order.id }}</h3>
                <p>Status {{ job.order.status }} · Fee {{ rupiah(job.order.delivery_fee) }}</p>
                <div class="actions">
                  <button class="btn secondary" type="button" @click="viewDriverJob(job.job_id)">Detail</button>
                  <button class="btn" type="button" @click="completeJob(job.job_id)">Confirm Completed</button>
                </div>
              </article>
              <div v-if="dashboard.driver.dashboard.active_jobs.length === 0" class="notice">Tidak ada job aktif.</div>
            </div>
          </section>

          <section v-show="activeTab === 'history'" class="panel">
            <h2>Job History</h2>
            <div class="kpi"><span>Earnings</span><b>{{ rupiah(dashboard.driver.dashboard.earnings) }}</b></div>
            <p class="muted">{{ dashboard.driver.dashboard.earning_rule }}</p>
            <div class="grid">
              <article v-for="job in dashboard.driver.dashboard.job_history" :key="job.job_id" class="card">
                <h3>Job #{{ job.job_id }} · {{ job.status }}</h3>
                <p>Order #{{ job.order.id }} · Earning {{ rupiah(job.order.driver_earning) }}</p>
                <button class="btn secondary" type="button" @click="viewDriverJob(job.job_id)">Detail</button>
                <Timeline :history="job.order.history" :dt="dt" />
              </article>
            </div>
          </section>

          <section v-if="dashboard.driver.selectedJob" class="panel">
            <h2>Detail Job #{{ dashboard.driver.selectedJob.job_id }}</h2>
            <div class="grid cols-2">
              <div>
                <p><b>Status:</b> {{ dashboard.driver.selectedJob.status }}</p>
                <p><b>Order:</b> #{{ dashboard.driver.selectedJob.order.id }} · {{ dashboard.driver.selectedJob.order.status }}</p>
                <p><b>Alamat:</b> {{ dashboard.driver.selectedJob.order.address_snapshot }}</p>
              </div>
              <div>
                <p><b>Delivery:</b> {{ dashboard.driver.selectedJob.order.delivery_method }}</p>
                <p><b>Fee:</b> {{ rupiah(dashboard.driver.selectedJob.order.delivery_fee) }}</p>
                <p><b>Earning:</b> {{ rupiah(dashboard.driver.selectedJob.order.driver_earning) }}</p>
              </div>
            </div>
            <Timeline :history="dashboard.driver.selectedJob.order.history" :dt="dt" />
          </section>
        </section>

        <section v-if="user?.active_role === 'Admin'" class="dashboard-stack">
          <div class="tabs">
            <button :class="{ active: activeTab === 'monitoring' }" @click="activeTab = 'monitoring'">Monitoring</button>
            <button :class="{ active: activeTab === 'analytics' }" @click="activeTab = 'analytics'">Analytics</button>
            <button :class="{ active: activeTab === 'discounts' }" @click="activeTab = 'discounts'">Discounts</button>
            <button :class="{ active: activeTab === 'overdue' }" @click="activeTab = 'overdue'">Overdue</button>
            <button :class="{ active: activeTab === 'audit' }" @click="activeTab = 'audit'">Audit</button>
            <button :class="{ active: activeTab === 'data' }" @click="activeTab = 'data'">Data</button>
          </div>

          <section v-show="activeTab === 'monitoring'" class="panel">
            <h2>Marketplace Monitoring</h2>
            <p class="muted">Tanggal operasional: {{ dt(dashboard.admin.summary.simulated_now) }}</p>
            <div class="grid cols-4 metric-row">
              <div v-for="key in adminMetricKeys" :key="key" class="kpi">
                <span>{{ adminMetricLabel(key) }}</span>
                <b>{{ dashboard.admin.summary[key] || 0 }}</b>
              </div>
            </div>
            <h3>Status Summary</h3>
            <div class="grid cols-3 metric-row">
              <div v-for="(value, key) in dashboard.admin.summary.status_summary" :key="key" class="kpi">
                <span>{{ key }}</span>
                <b>{{ value }}</b>
              </div>
            </div>
          </section>

          <section v-show="activeTab === 'analytics'" class="panel">
            <h2>Operational Analytics</h2>
            <div class="grid cols-4 metric-row">
              <div class="kpi"><span>GMV</span><b>{{ rupiah(dashboard.admin.analytics.gross_merchandise_value) }}</b></div>
              <div class="kpi"><span>Completed GMV</span><b>{{ rupiah(dashboard.admin.analytics.completed_gmv) }}</b></div>
              <div class="kpi"><span>PPN Total</span><b>{{ rupiah(dashboard.admin.analytics.ppn_total) }}</b></div>
              <div class="kpi"><span>Discounts</span><b>{{ rupiah(dashboard.admin.analytics.discount_total) }}</b></div>
              <div class="kpi"><span>Seller Income</span><b>{{ rupiah(dashboard.admin.analytics.seller_income) }}</b></div>
              <div class="kpi"><span>Driver Earnings</span><b>{{ rupiah(dashboard.admin.analytics.driver_earnings) }}</b></div>
              <div class="kpi"><span>Active Orders</span><b>{{ dashboard.admin.analytics.active_orders || 0 }}</b></div>
              <div class="kpi"><span>AOV</span><b>{{ rupiah(dashboard.admin.analytics.average_order_value) }}</b></div>
            </div>
            <h3>Store Performance</h3>
            <DataTable :rows="dashboard.admin.analytics.store_performance" :columns="['store_id', 'store_name', 'product_count', 'completed_orders', 'income']" :formatters="tableFormatters" />
            <h3>Low Stock</h3>
            <DataTable :rows="dashboard.admin.analytics.low_stock_products" :columns="['id', 'name', 'price', 'stock']" :formatters="tableFormatters" />
          </section>

          <section v-show="activeTab === 'discounts'" class="panel">
            <h2>Voucher & Promo Management</h2>
            <div class="grid cols-2">
              <form class="grid" @submit.prevent="createVoucher">
                <h3>Create Voucher</h3>
                <label>Kode<input v-model.trim="adminForms.voucher.code"></label>
                <label>Value<input v-model.number="adminForms.voucher.value" type="number"></label>
                <label>Expiry Days<input v-model.number="adminForms.voucher.expiry_days" type="number"></label>
                <label>Remaining Usage<input v-model.number="adminForms.voucher.remaining_usage" type="number"></label>
                <button class="btn">Create Voucher</button>
              </form>
              <form class="grid" @submit.prevent="createPromo">
                <h3>Create Promo</h3>
                <label>Kode<input v-model.trim="adminForms.promo.code"></label>
                <label>Percent<input v-model.number="adminForms.promo.percent" type="number"></label>
                <label>Expiry Days<input v-model.number="adminForms.promo.expiry_days" type="number"></label>
                <button class="btn">Create Promo</button>
              </form>
            </div>
            <h3>Vouchers</h3>
            <DataTable :rows="dashboard.admin.vouchers" :columns="['code', 'value', 'expiry_date', 'remaining_usage']" :formatters="tableFormatters" />
            <h3>Promos</h3>
            <DataTable :rows="dashboard.admin.promos" :columns="['code', 'percent', 'expiry_date']" :formatters="tableFormatters" />
          </section>

          <section v-show="activeTab === 'overdue'" class="panel">
            <h2>Manajemen SLA</h2>
            <p class="muted">SLA: Instant 1 hari, Next Day 2 hari, Regular 4 hari. Sistem dapat memproses pengembalian dan refund untuk pesanan yang melewati batas SLA.</p>
            <div class="actions">
              <button class="btn" type="button" @click="simulateNextDay">Proses Hari Berikutnya</button>
              <button class="btn secondary" type="button" @click="runOverdue">Cek SLA Pengiriman</button>
            </div>
            <h3>Pesanan Melewati SLA</h3>
            <OrderCards :orders="dashboard.admin.summary.overdue_orders || []" :rupiah="rupiah" :dt="dt" />
          </section>

          <section v-show="activeTab === 'audit'" class="panel">
            <h2>Audit Trail</h2>
            <DataTable :rows="dashboard.admin.auditLogs" :columns="['created_at', 'actor', 'action', 'entity_type', 'entity_id', 'details']" :formatters="tableFormatters" />
          </section>

          <section v-show="activeTab === 'data'" class="panel">
            <h2>Data Operasional</h2>
            <h3>Users</h3>
            <DataTable :rows="dashboard.admin.users" :columns="['id', 'username', 'email', 'roles', 'active_role']" :formatters="tableFormatters" />
            <h3>Stores</h3>
            <DataTable :rows="dashboard.admin.stores" :columns="['id', 'name', 'description', 'seller_id']" :formatters="tableFormatters" />
            <h3>Products</h3>
            <DataTable :rows="dashboard.admin.products" :columns="['id', 'name', 'price', 'stock']" :formatters="tableFormatters" />
            <h3>Delivery Jobs</h3>
            <DataTable :rows="dashboard.admin.deliveryJobs" :columns="['job_id', 'status', 'driver_id', 'created_at']" :formatters="tableFormatters" />
            <h3>Orders</h3>
            <OrderCards :orders="dashboard.admin.orders" :rupiah="rupiah" :dt="dt" />
          </section>
        </section>
      </section>
    </template>
  </main>

  <footer class="footer">
    <b>SEAPEDIA</b>
    <span>Marketplace multi-role dengan Express.js API dan Vue.js frontend.</span>
  </footer>
</template>

<script>
const API_BASE = import.meta.env.VITE_API_BASE || "";

const DataTable = {
  props: {
    rows: { type: Array, default: () => [] },
    columns: { type: Array, default: () => [] },
    formatters: { type: Object, default: () => ({}) }
  },
  methods: {
    cell(row, column) {
      const value = row?.[column];
      const formatter = this.formatters[column] || this.formatters.default;
      return formatter ? formatter(value, column, row) : value;
    }
  },
  template: `
    <div v-if="rows.length" class="table-wrap">
      <table>
        <thead><tr><th v-for="column in columns" :key="column">{{ column }}</th></tr></thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="row.id || row.job_id || index">
            <td v-for="column in columns" :key="column">{{ cell(row, column) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="notice">Kosong.</div>
  `
};

const Timeline = {
  props: {
    history: { type: Array, default: () => [] },
    dt: { type: Function, required: true }
  },
  template: `
    <div class="timeline">
      <div v-for="(item, index) in history" :key="index" class="timeline-item">
        <b>{{ item.status }}</b>
        <span>{{ item.note }}<br><small class="muted">{{ dt(item.created_at) }}</small></span>
      </div>
    </div>
  `
};

const OrderCards = {
  components: { Timeline },
  props: {
    orders: { type: Array, default: () => [] },
    rupiah: { type: Function, required: true },
    dt: { type: Function, required: true }
  },
  template: `
    <div class="grid">
      <article v-for="order in orders" :key="order.id" class="card">
        <h3>Order #{{ order.id }} · {{ order.status }}</h3>
        <p>{{ order.delivery_method }} · Final {{ rupiah(order.final_total) }} · Diskon {{ rupiah(order.discount) }} · PPN {{ rupiah(order.ppn) }}</p>
        <div>
          <span v-for="item in order.items" :key="item.product_id" class="badge">{{ item.product_name }} x{{ item.quantity }}</span>
        </div>
        <Timeline :history="order.history" :dt="dt" />
      </article>
      <div v-if="orders.length === 0" class="notice">Belum ada order.</div>
    </div>
  `
};

function createEmptyDashboard() {
  return {
    notifications: { unread_count: 0, items: [] },
    buyer: {
      wallet: { balance: 0, transactions: [] },
      addresses: [],
      cart: { items: [], subtotal: 0, store_name: "" },
      orders: [],
      report: { spending: 0, returned_or_refunded: 0, order_count: 0 }
    },
    seller: { store: null, products: [], orders: [], report: {} },
    driver: {
      available: [],
      dashboard: { earnings: 0, active_jobs: [], job_history: [] },
      selectedJob: null
    },
    admin: {
      summary: { status_summary: {}, overdue_orders: [] },
      analytics: { store_performance: [], low_stock_products: [] },
      auditLogs: [],
      vouchers: [],
      promos: [],
      orders: [],
      users: [],
      stores: [],
      products: [],
      deliveryJobs: []
    }
  };
}

export default {
  name: "App",
  components: { DataTable, Timeline, OrderCards },
  data() {
    return {
      route: window.location.hash || "#/",
      loading: false,
      error: "",
      user: null,
      products: [],
      stores: [],
      selectedProduct: null,
      selectedStore: null,
      activeTab: "wallet",
      authMessage: "",
      showLoginPassword: false,
      showRegisterPassword: false,
      loginForm: { username: "", password: "" },
      registerForm: { username: "", email: "", password: "", roles: ["Buyer"] },
      publicRoles: [
        { value: "Buyer", description: "Belanja, cart, wallet, checkout." },
        { value: "Seller", description: "Kelola store, produk, dan order." },
        { value: "Driver", description: "Ambil job dan selesaikan pengiriman." }
      ],
      catalogFilter: { q: "", store_id: "", min_price: "", max_price: "", sort: "newest", in_stock: "" },
      buyerForms: {
        topupAmount: 500000,
        address: { recipient_name: "", phone: "", full_address: "" },
        checkout: { address_id: "", delivery_method: "Regular", discount_code: "" },
        checkoutSummary: null,
        message: ""
      },
      sellerForms: {
        store: { name: "", description: "" },
        product: { id: null, name: "", description: "", price: 0, stock: 0 }
      },
      adminForms: {
        voucher: { code: "NEW25", value: 25000, expiry_days: 30, remaining_usage: 10 },
        promo: { code: "NEW10", percent: 10, expiry_days: 30 }
      },
      dashboard: createEmptyDashboard()
    };
  },
  computed: {
    page() {
      if (this.route === "#/" || this.route === "#") return "home";
      if (this.route === "#/products") return "products";
      if (this.route.startsWith("#/products/")) return "product-detail";
      if (this.route.startsWith("#/stores/")) return "store-detail";
      if (this.route === "#/login") return "login";
      if (this.route === "#/register") return "register";
      if (this.route === "#/choose-role") return "choose-role";
      if (this.route === "#/dashboard") return "dashboard";
      return "home";
    },
    latestProducts() {
      return this.products.slice(0, 4);
    },
    storeCount() {
      return new Set(this.products.map((product) => product.store?.id).filter(Boolean)).size;
    },
    adminMetricKeys() {
      return ["users", "stores", "products", "orders", "vouchers", "promos", "delivery_jobs"];
    },
    tableFormatters() {
      return {
        amount: (value) => this.rupiah(value),
        price: (value) => this.rupiah(value),
        income: (value) => this.rupiah(value),
        value: (value) => this.rupiah(value),
        created_at: (value) => this.dt(value),
        expiry_date: (value) => this.dt(value),
        roles: (value) => Array.isArray(value) ? value.join(", ") : value,
        actor: (value) => value?.username ? `${value.username} (${value.active_role || "-"})` : "system",
        details: (value) => value ? JSON.stringify(value) : "-",
        default: (value) => {
          if (Array.isArray(value)) return `${value.length} item`;
          if (value && typeof value === "object") return JSON.stringify(value);
          return value ?? "-";
        }
      };
    }
  },
  async mounted() {
    window.addEventListener("hashchange", this.onRouteChange);
    await this.onRouteChange();
  },
  beforeUnmount() {
    window.removeEventListener("hashchange", this.onRouteChange);
  },
  methods: {
    token() {
      return localStorage.getItem("seapedia_token");
    },
    setToken(value) {
      if (value) localStorage.setItem("seapedia_token", value);
      else localStorage.removeItem("seapedia_token");
    },
    async api(path, options = {}) {
      const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
      if (this.token()) headers.Authorization = `Bearer ${this.token()}`;
      const response = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { detail: text };
      }
      if (!response.ok) throw new Error(data.detail || "Request gagal");
      return data;
    },
    rupiah(value) {
      return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
    },
    dt(value) {
      return value ? new Date(value).toLocaleString("id-ID") : "-";
    },
    productImage(product) {
      const text = `${product?.name || ""} ${product?.description || ""} ${product?.store?.name || ""}`.toLowerCase();
      if (text.includes("udang") || text.includes("vaname") || text.includes("shrimp")) return "/products/udang-vaname.png";
      if (text.includes("keranjang") || text.includes("basket")) return "/products/keranjang-lipat.png";
      if (text.includes("cooler") || text.includes("pendingin") || text.includes("box")) return "/products/cooler-box-mini.png";
      if (text.includes("ikan") || text.includes("tuna") || text.includes("laut") || text.includes("fish")) return "/products/tuna-premium.png";
      return "/products/keranjang-lipat.png";
    },
    async refreshMe() {
      if (!this.token()) {
        this.user = null;
        return null;
      }
      try {
        this.user = await this.api("/me");
        return this.user;
      } catch {
        this.setToken(null);
        this.user = null;
        return null;
      }
    },
    async onRouteChange() {
      this.route = window.location.hash || "#/";
      this.error = "";
      this.authMessage = "";
      this.loading = true;
      try {
        await this.refreshMe();
        await this.loadCurrentPage();
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    async loadCurrentPage() {
      if (this.page === "home") return this.loadProducts();
      if (this.page === "products") return this.loadProducts();
      if (this.page === "product-detail") return this.loadProductDetail(this.route.split("/").pop());
      if (this.page === "store-detail") return this.loadStoreDetail(this.route.split("/").pop());
      if (this.page === "choose-role" && !this.user) {
        window.location.hash = "#/login";
        return;
      }
      if (this.page === "dashboard") return this.loadDashboard();
    },
    async loadProducts(params = null) {
      const query = params ? `?${params.toString()}` : "";
      this.products = await this.api(`/products${query}`);
      this.stores = [...new Map(this.products.map((product) => [product.store?.id, product.store]).filter(([id]) => id)).values()];
    },
    async applyCatalogFilter() {
      const params = new URLSearchParams();
      Object.entries(this.catalogFilter).forEach(([key, value]) => {
        if (value !== "" && value !== null && value !== undefined) params.set(key, value);
      });
      await this.loadProducts(params);
    },
    async loadProductDetail(id) {
      this.selectedProduct = await this.api(`/products/${id}`);
    },
    async loadStoreDetail(id) {
      this.selectedStore = await this.api(`/stores/${id}`);
    },
    async login() {
      this.authMessage = "";
      try {
        const data = await this.api("/auth/login", { method: "POST", body: JSON.stringify(this.loginForm) });
        this.setToken(data.access_token);
        await this.refreshMe();
        window.location.hash = data.needs_role_selection ? "#/choose-role" : "#/dashboard";
      } catch (error) {
        this.authMessage = error.message;
      }
    },
    async register() {
      this.authMessage = "";
      if (!this.registerForm.roles.length) {
        this.authMessage = "Pilih minimal satu role.";
        return;
      }
      try {
        const data = await this.api("/auth/register", { method: "POST", body: JSON.stringify(this.registerForm) });
        this.setToken(data.access_token);
        await this.refreshMe();
        window.location.hash = data.needs_role_selection ? "#/choose-role" : "#/dashboard";
      } catch (error) {
        this.authMessage = error.message;
      }
    },
    async chooseRole(role) {
      const data = await this.api("/auth/choose-role", { method: "POST", body: JSON.stringify({ role }) });
      this.setToken(data.access_token);
      await this.refreshMe();
      window.location.hash = "#/dashboard";
    },
    async logout() {
      try {
        await this.api("/auth/logout", { method: "POST" });
      } catch {
        // Token is cleared client-side regardless of API availability.
      }
      this.setToken(null);
      this.user = null;
      window.location.hash = "#/";
    },
    async quickAdd(productId) {
      try {
        await this.api("/buyer/cart/items", { method: "POST", body: JSON.stringify({ product_id: productId, quantity: 1 }) });
        this.error = "";
        window.location.hash = "#/dashboard";
      } catch (error) {
        this.error = error.message;
      }
    },
    async loadDashboard() {
      if (!this.user) {
        window.location.hash = "#/login";
        return;
      }
      if (!this.user.active_role) {
        window.location.hash = "#/choose-role";
        return;
      }
      if (this.user.active_role === "Buyer") {
        this.activeTab = ["wallet", "address", "cart", "orders"].includes(this.activeTab) ? this.activeTab : "wallet";
        return this.loadBuyerDashboard();
      }
      if (this.user.active_role === "Seller") {
        this.activeTab = ["store", "products", "orders", "report"].includes(this.activeTab) ? this.activeTab : "store";
        return this.loadSellerDashboard();
      }
      if (this.user.active_role === "Driver") {
        this.activeTab = ["available", "active", "history"].includes(this.activeTab) ? this.activeTab : "available";
        return this.loadDriverDashboard();
      }
      if (this.user.active_role === "Admin") {
        this.activeTab = ["monitoring", "analytics", "discounts", "overdue", "audit", "data"].includes(this.activeTab) ? this.activeTab : "monitoring";
        return this.loadAdminDashboard();
      }
    },
    async loadNotifications() {
      try {
        this.dashboard.notifications = await this.api("/notifications");
      } catch {
        this.dashboard.notifications = { unread_count: 0, items: [] };
      }
    },
    async markNotificationsRead() {
      await this.api("/notifications/read-all", { method: "POST" });
      await this.loadDashboard();
    },
    async loadBuyerDashboard() {
      const [wallet, addresses, cart, orders, report, notifications] = await Promise.all([
        this.api("/buyer/wallet"),
        this.api("/buyer/addresses"),
        this.api("/buyer/cart"),
        this.api("/buyer/orders"),
        this.api("/buyer/report"),
        this.api("/notifications")
      ]);
      this.dashboard.buyer = { wallet, addresses, cart, orders, report };
      this.dashboard.notifications = notifications;
      if (!this.buyerForms.checkout.address_id && addresses[0]) this.buyerForms.checkout.address_id = addresses[0].id;
    },
    async topupWallet() {
      await this.api("/buyer/wallet/topup", { method: "POST", body: JSON.stringify({ amount: Number(this.buyerForms.topupAmount) }) });
      await this.loadBuyerDashboard();
    },
    async saveAddress() {
      await this.api("/buyer/addresses", { method: "POST", body: JSON.stringify(this.buyerForms.address) });
      this.buyerForms.address = { recipient_name: "", phone: "", full_address: "" };
      await this.loadBuyerDashboard();
    },
    async updateCart(cartItemId, quantity) {
      await this.api(`/buyer/cart/items/${cartItemId}`, { method: "PATCH", body: JSON.stringify({ quantity: Number(quantity) }) });
      await this.loadBuyerDashboard();
    },
    async deleteCart(cartItemId) {
      await this.api(`/buyer/cart/items/${cartItemId}`, { method: "DELETE" });
      await this.loadBuyerDashboard();
    },
    async clearCart() {
      await this.api("/buyer/cart", { method: "DELETE" });
      await this.loadBuyerDashboard();
    },
    checkoutPayload() {
      return {
        address_id: Number(this.buyerForms.checkout.address_id),
        delivery_method: this.buyerForms.checkout.delivery_method,
        discount_code: this.buyerForms.checkout.discount_code || null
      };
    },
    async checkoutSummary() {
      this.buyerForms.checkoutSummary = await this.api("/buyer/checkout/summary", { method: "POST", body: JSON.stringify(this.checkoutPayload()) });
    },
    async checkout() {
      const data = await this.api("/buyer/checkout", { method: "POST", body: JSON.stringify(this.checkoutPayload()) });
      this.buyerForms.message = `Checkout berhasil. Order #${data.order.id}`;
      this.buyerForms.checkoutSummary = null;
      await this.loadBuyerDashboard();
    },
    async loadSellerDashboard() {
      const [store, products, orders, report, notifications] = await Promise.all([
        this.api("/seller/store"),
        this.api("/seller/products"),
        this.api("/seller/orders"),
        this.api("/seller/report"),
        this.api("/notifications")
      ]);
      this.dashboard.seller = { store, products, orders, report };
      this.dashboard.notifications = notifications;
      this.sellerForms.store = { name: store?.name || "", description: store?.description || "" };
    },
    async saveStore() {
      await this.api("/seller/store", { method: "POST", body: JSON.stringify(this.sellerForms.store) });
      await this.loadSellerDashboard();
    },
    editSellerProduct(product) {
      this.sellerForms.product = {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock
      };
    },
    async saveSellerProduct() {
      const { id, ...payload } = this.sellerForms.product;
      const endpoint = id ? `/seller/products/${id}` : "/seller/products";
      await this.api(endpoint, { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      this.sellerForms.product = { id: null, name: "", description: "", price: 0, stock: 0 };
      await this.loadSellerDashboard();
    },
    async deleteSellerProduct(productId) {
      await this.api(`/seller/products/${productId}`, { method: "DELETE" });
      await this.loadSellerDashboard();
    },
    async processOrder(orderId) {
      await this.api(`/seller/orders/${orderId}/process`, { method: "POST" });
      await this.loadSellerDashboard();
    },
    async loadDriverDashboard() {
      const [available, driverDashboard, notifications] = await Promise.all([
        this.api("/driver/jobs/available"),
        this.api("/driver/dashboard"),
        this.api("/notifications")
      ]);
      this.dashboard.driver.available = available;
      this.dashboard.driver.dashboard = driverDashboard;
      this.dashboard.notifications = notifications;
    },
    async takeJob(jobId) {
      await this.api(`/driver/jobs/${jobId}/take`, { method: "POST" });
      await this.loadDriverDashboard();
    },
    async completeJob(jobId) {
      await this.api(`/driver/jobs/${jobId}/complete`, { method: "POST" });
      await this.loadDriverDashboard();
    },
    async viewDriverJob(jobId) {
      this.dashboard.driver.selectedJob = await this.api(`/driver/jobs/${jobId}`);
    },
    async loadAdminDashboard() {
      const [summary, analytics, auditLogs, vouchers, promos, orders, users, stores, products, deliveryJobs, notifications] = await Promise.all([
        this.api("/admin/dashboard"),
        this.api("/admin/analytics"),
        this.api("/admin/audit-logs"),
        this.api("/admin/vouchers"),
        this.api("/admin/promos"),
        this.api("/admin/orders"),
        this.api("/admin/users"),
        this.api("/admin/stores"),
        this.api("/admin/products"),
        this.api("/admin/delivery-jobs"),
        this.api("/notifications")
      ]);
      this.dashboard.admin = { summary, analytics, auditLogs, vouchers, promos, orders, users, stores, products, deliveryJobs };
      this.dashboard.notifications = notifications;
    },
    adminMetricLabel(key) {
      return ({
        users: "Users",
        stores: "Stores",
        products: "Products",
        orders: "Orders",
        vouchers: "Vouchers",
        promos: "Promos",
        delivery_jobs: "Delivery Jobs"
      })[key] || key;
    },
    async createVoucher() {
      await this.api("/admin/vouchers", { method: "POST", body: JSON.stringify(this.adminForms.voucher) });
      await this.loadAdminDashboard();
    },
    async createPromo() {
      await this.api("/admin/promos", { method: "POST", body: JSON.stringify(this.adminForms.promo) });
      await this.loadAdminDashboard();
    },
    async simulateNextDay() {
      await this.api("/admin/simulate-next-day", { method: "POST" });
      await this.loadAdminDashboard();
    },
    async runOverdue() {
      await this.api("/admin/run-overdue-check", { method: "POST" });
      await this.loadAdminDashboard();
    }
  }
};
</script>
