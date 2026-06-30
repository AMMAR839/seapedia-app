from __future__ import annotations

import base64
import hashlib
import hmac
import html
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
    select,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

APP_NAME = "SEAPEDIA"
BASE_DIR = Path(__file__).resolve().parent
DB_URL = os.getenv("SEAPEDIA_DATABASE_URL", f"sqlite:///{BASE_DIR.parent / 'seapedia.db'}")
SECRET_KEY = os.getenv("SEAPEDIA_SECRET_KEY", "change-this-secret-in-production")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = int(os.getenv("SEAPEDIA_TOKEN_EXPIRE_MINUTES", "480"))
PPN_RATE = 0.12
DELIVERY_FEES = {"Instant": 25000, "Next Day": 15000, "Regular": 10000}
DELIVERY_SLA_DAYS = {"Instant": 1, "Next Day": 2, "Regular": 4}
DRIVER_EARNING_RATE = 0.8
MAIN_STATUSES = ["Sedang Dikemas", "Menunggu Pengirim", "Sedang Dikirim", "Pesanan Selesai", "Dikembalikan"]
VALID_ROLES = {"Admin", "Seller", "Buyer", "Driver"}
NON_ADMIN_ROLES = {"Seller", "Buyer", "Driver"}

engine_args = {"connect_args": {"check_same_thread": False}} if DB_URL.startswith("sqlite") else {}
engine = create_engine(DB_URL, echo=False, future=True, **engine_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    roles_csv: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    store: Mapped[Optional["Store"]] = relationship(back_populates="seller", uselist=False)

    @property
    def roles(self) -> list[str]:
        return [r for r in self.roles_csv.split(",") if r]


class Store(Base):
    __tablename__ = "stores"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    seller: Mapped[User] = relationship(back_populates="store")
    products: Mapped[list["Product"]] = relationship(back_populates="store")


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[float] = mapped_column(Float, nullable=False)
    stock: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    store: Mapped[Store] = relationship(back_populates="products")


class ApplicationReview(Base):
    __tablename__ = "application_reviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reviewer_name: Mapped[str] = mapped_column(String(100), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Address(Base):
    __tablename__ = "addresses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    recipient_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    full_address: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CartItem(Base):
    __tablename__ = "cart_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    __table_args__ = (UniqueConstraint("buyer_id", "product_id", name="uq_cart_buyer_product"),)

    product: Mapped[Product] = relationship()


class Voucher(Base):
    __tablename__ = "vouchers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    expiry_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    remaining_usage: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Promo(Base):
    __tablename__ = "promos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    percent: Mapped[float] = mapped_column(Float, nullable=False)
    expiry_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False, index=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    address_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_method: Mapped[str] = mapped_column(String(30), nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    discount: Mapped[float] = mapped_column(Float, default=0)
    discount_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    discount_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    delivery_fee: Mapped[float] = mapped_column(Float, nullable=False)
    ppn: Mapped[float] = mapped_column(Float, nullable=False)
    final_total: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="Sedang Dikemas", index=True)
    driver_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    driver_earning: Mapped[float] = mapped_column(Float, default=0)
    is_refunded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    histories: Mapped[list["OrderStatusHistory"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    delivery_job: Mapped[Optional["DeliveryJob"]] = relationship(back_populates="order", uselist=False)


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    product_name: Mapped[str] = mapped_column(String(150), nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_histories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    order: Mapped[Order] = relationship(back_populates="histories")


class DeliveryJob(Base):
    __tablename__ = "delivery_jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True, nullable=False)
    driver_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default="Available")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    taken_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    order: Mapped[Order] = relationship(back_populates="delivery_job")


class AppState(Base):
    __tablename__ = "app_state"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(String(255), nullable=False)


class Role(str, Enum):
    Admin = "Admin"
    Seller = "Seller"
    Buyer = "Buyer"
    Driver = "Driver"


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=6, max_length=120)
    roles: list[Role] = Field(default_factory=lambda: [Role.Buyer])

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Email tidak valid")
        return v.lower()

    @field_validator("roles")
    @classmethod
    def validate_roles(cls, roles: list[Role]) -> list[Role]:
        unique = list(dict.fromkeys(roles))
        if Role.Admin in unique and len(unique) > 1:
            raise ValueError("Admin harus berdiri sendiri sebagai role khusus")
        return unique


class LoginIn(BaseModel):
    username: str
    password: str


class ChooseRoleIn(BaseModel):
    role: Role


class ReviewIn(BaseModel):
    reviewer_name: str = Field(min_length=2, max_length=100)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1, max_length=1000)


class StoreIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    description: str = Field(default="", max_length=1000)


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str = Field(default="", max_length=2000)
    price: float = Field(gt=0)
    stock: int = Field(ge=0)


class TopupIn(BaseModel):
    amount: float = Field(gt=0, le=100000000)


class AddressIn(BaseModel):
    recipient_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=6, max_length=30)
    full_address: str = Field(min_length=8, max_length=1000)

    @field_validator("phone")
    @classmethod
    def valid_phone(cls, v: str) -> str:
        if not re.match(r"^[0-9+()\-\s]+$", v):
            raise ValueError("Nomor telepon hanya boleh berisi angka dan simbol telepon standar")
        return v


class CartAddIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=999)


class CartUpdateIn(BaseModel):
    quantity: int = Field(gt=0, le=999)


class CheckoutIn(BaseModel):
    address_id: int
    delivery_method: str
    discount_code: Optional[str] = Field(default=None, max_length=40)

    @field_validator("delivery_method")
    @classmethod
    def delivery_method_ok(cls, v: str) -> str:
        if v not in DELIVERY_FEES:
            raise ValueError("Metode pengiriman harus Instant, Next Day, atau Regular")
        return v


class VoucherIn(BaseModel):
    code: str = Field(min_length=3, max_length=40)
    value: float = Field(gt=0)
    expiry_days: int = Field(gt=0, le=365)
    remaining_usage: int = Field(gt=0, le=100000)


class PromoIn(BaseModel):
    code: str = Field(min_length=3, max_length=40)
    percent: float = Field(gt=0, le=100)
    expiry_days: int = Field(gt=0, le=365)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    roles: list[str]
    active_role: Optional[str]
    needs_role_selection: bool


app = FastAPI(
    title="SEAPEDIA API",
    version="1.0.0",
    description="API-based fullstack marketplace for COMPFEST 18 Software Engineering Academy technical challenge.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def sanitize_text(value: str) -> str:
    cleaned = value.strip()
    # Store text escaped so public user-generated content never renders as executable markup.
    return html.escape(cleaned, quote=True)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_b64, dk_b64 = password_hash.split("$", 1)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(dk_b64)
        got = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
        return hmac.compare_digest(got, expected)
    except Exception:
        return False


def create_token(user: User, active_role: Optional[str] = None) -> str:
    expire = utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user.id), "roles": user.roles, "active_role": active_role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token sudah kedaluwarsa")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> tuple[User, Optional[str]]:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Login diperlukan")
    payload = decode_token(auth.removeprefix("Bearer ").strip())
    user = db.get(User, int(payload.get("sub")))
    if not user:
        raise HTTPException(status_code=401, detail="User tidak ditemukan")
    active_role = payload.get("active_role")
    return user, active_role


def require_role(role: str):
    def dependency(current: tuple[User, Optional[str]] = Depends(get_current_user)) -> User:
        user, active_role = current
        if active_role != role:
            raise HTTPException(status_code=403, detail=f"Akses memerlukan active role {role}")
        if role not in user.roles:
            raise HTTPException(status_code=403, detail="Role tidak dimiliki user")
        return user

    return dependency


def user_to_dict(user: User, active_role: Optional[str] = None) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "roles": user.roles,
        "active_role": active_role,
        "created_at": user.created_at,
    }


def get_wallet_balance(db: Session, buyer_id: int) -> float:
    total = db.scalar(select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(WalletTransaction.buyer_id == buyer_id))
    return float(total or 0)


def get_simulated_now(db: Session) -> datetime:
    offset = db.get(AppState, "day_offset")
    days = int(offset.value) if offset else 0
    return utcnow() + timedelta(days=days)


def set_status(db: Session, order: Order, status_value: str, note: str = "") -> None:
    order.status = status_value
    db.add(OrderStatusHistory(order_id=order.id, status=status_value, note=sanitize_text(note), created_at=get_simulated_now(db)))


def product_public_dict(p: Product) -> dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "price": p.price,
        "stock": p.stock,
        "store": {"id": p.store.id, "name": p.store.name, "description": p.store.description},
        "created_at": p.created_at,
    }


def order_dict(order: Order) -> dict[str, Any]:
    return {
        "id": order.id,
        "buyer_id": order.buyer_id,
        "store_id": order.store_id,
        "seller_id": order.seller_id,
        "address_snapshot": order.address_snapshot,
        "delivery_method": order.delivery_method,
        "subtotal": order.subtotal,
        "discount": order.discount,
        "discount_code": order.discount_code,
        "discount_type": order.discount_type,
        "delivery_fee": order.delivery_fee,
        "ppn": order.ppn,
        "final_total": order.final_total,
        "status": order.status,
        "driver_id": order.driver_id,
        "driver_earning": order.driver_earning,
        "is_refunded": order.is_refunded,
        "created_at": order.created_at,
        "completed_at": order.completed_at,
        "items": [
            {"product_id": i.product_id, "product_name": i.product_name, "price": i.price, "quantity": i.quantity}
            for i in order.items
        ],
        "history": [
            {"status": h.status, "note": h.note, "created_at": h.created_at}
            for h in sorted(order.histories, key=lambda x: x.created_at)
        ],
    }


def validate_discount(db: Session, code: Optional[str], subtotal: float) -> tuple[float, Optional[str], Optional[str]]:
    if not code:
        return 0, None, None
    normalized = code.strip().upper()
    now = get_simulated_now(db)
    voucher = db.scalar(select(Voucher).where(Voucher.code == normalized))
    if voucher:
        if voucher.expiry_date < now:
            raise HTTPException(status_code=400, detail="Voucher sudah kedaluwarsa")
        if voucher.remaining_usage <= 0:
            raise HTTPException(status_code=400, detail="Voucher sudah habis digunakan")
        return min(voucher.value, subtotal), voucher.code, "Voucher"
    promo = db.scalar(select(Promo).where(Promo.code == normalized))
    if promo:
        if promo.expiry_date < now:
            raise HTTPException(status_code=400, detail="Promo sudah kedaluwarsa")
        return min(subtotal * (promo.percent / 100), subtotal), promo.code, "Promo"
    raise HTTPException(status_code=400, detail="Kode diskon tidak ditemukan")


def cart_summary_for_buyer(db: Session, buyer_id: int) -> dict[str, Any]:
    items = list(db.scalars(select(CartItem).where(CartItem.buyer_id == buyer_id)).all())
    rows = []
    subtotal = 0.0
    store_id = None
    store_name = None
    for item in items:
        p = item.product
        subtotal += p.price * item.quantity
        store_id = p.store_id
        store_name = p.store.name
        rows.append(
            {
                "cart_item_id": item.id,
                "product_id": p.id,
                "product_name": p.name,
                "quantity": item.quantity,
                "price": p.price,
                "line_total": p.price * item.quantity,
                "stock": p.stock,
                "store_id": p.store_id,
                "store_name": p.store.name,
            }
        )
    return {"items": rows, "subtotal": subtotal, "store_id": store_id, "store_name": store_name}


def build_checkout_summary(db: Session, buyer_id: int, delivery_method: str, discount_code: Optional[str]) -> dict[str, Any]:
    cart = cart_summary_for_buyer(db, buyer_id)
    if not cart["items"]:
        raise HTTPException(status_code=400, detail="Cart masih kosong")
    discount, normalized_code, discount_type = validate_discount(db, discount_code, cart["subtotal"])
    tax_base = cart["subtotal"] - discount
    ppn = round(tax_base * PPN_RATE, 2)
    delivery_fee = DELIVERY_FEES[delivery_method]
    final_total = round(tax_base + delivery_fee + ppn, 2)
    return {
        "items": cart["items"],
        "store_id": cart["store_id"],
        "store_name": cart["store_name"],
        "subtotal": cart["subtotal"],
        "discount": discount,
        "discount_code": normalized_code,
        "discount_type": discount_type,
        "delivery_method": delivery_method,
        "delivery_fee": delivery_fee,
        "ppn_rate": PPN_RATE,
        "ppn": ppn,
        "final_total": final_total,
        "discount_rule": "Satu checkout hanya menerima satu kode. Voucher bernilai potongan nominal dan mengurangi remaining_usage. Promo bernilai persentase.",
        "ppn_rule": "PPN 12% dihitung setelah diskon dan sebelum biaya pengiriman ditambahkan ke total akhir.",
    }


def create_user(db: Session, username: str, email: str, password: str, roles: list[str]) -> User:
    user = User(username=username, email=email, password_hash=hash_password(password), roles_csv=",".join(roles))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def seed_data() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if not db.scalar(select(AppState).where(AppState.key == "day_offset")):
            db.add(AppState(key="day_offset", value="0"))
            db.commit()
        if db.scalar(select(User).where(User.username == "admin")):
            return
        admin = create_user(db, "admin", "admin@seapedia.test", "Admin123", ["Admin"])
        seller = create_user(db, "seller", "seller@seapedia.test", "Seller123", ["Seller"])
        buyer = create_user(db, "buyer", "buyer@seapedia.test", "Buyer123", ["Buyer"])
        driver = create_user(db, "driver", "driver@seapedia.test", "Driver123", ["Driver"])
        multi = create_user(db, "multi", "multi@seapedia.test", "Multi123", ["Buyer", "Seller", "Driver"])

        toko_laut = Store(seller_id=seller.id, name="Toko Laut Nusantara", description="Produk laut segar dan perlengkapan dapur pilihan.")
        toko_multi = Store(seller_id=multi.id, name="Multi Mart Bahari", description="Toko demo untuk akun multi-role.")
        db.add_all([toko_laut, toko_multi])
        db.commit()
        db.refresh(toko_laut)
        db.refresh(toko_multi)
        db.add_all(
            [
                Product(store_id=toko_laut.id, name="Paket Ikan Tuna Premium", description="Tuna fillet beku kualitas restoran.", price=85000, stock=25),
                Product(store_id=toko_laut.id, name="Udang Vaname 1 Kg", description="Udang vaname segar siap masak.", price=95000, stock=18),
                Product(store_id=toko_multi.id, name="Keranjang Belanja Lipat", description="Keranjang kokoh untuk belanja mingguan.", price=45000, stock=40),
                Product(store_id=toko_multi.id, name="Cooler Box Mini", description="Kotak pendingin praktis untuk pengiriman cepat.", price=125000, stock=10),
            ]
        )
        db.add_all(
            [
                ApplicationReview(reviewer_name="Alya", rating=5, comment="Mudah dipakai dan alurnya jelas."),
                ApplicationReview(reviewer_name="Rizky", rating=4, comment="Marketplace multi-role ini terasa lengkap untuk demo."),
            ]
        )
        db.add(WalletTransaction(buyer_id=buyer.id, kind="TOPUP", amount=1000000, note="Seed balance buyer"))
        db.add(WalletTransaction(buyer_id=multi.id, kind="TOPUP", amount=750000, note="Seed balance multi-role"))
        db.add(Address(buyer_id=buyer.id, recipient_name="Buyer Demo", phone="081234567890", full_address="Jl. Demo SEAPEDIA No. 18, Jakarta"))
        db.add(Address(buyer_id=multi.id, recipient_name="Multi Demo", phone="081298765432", full_address="Jl. Multi Role No. 7, Depok"))
        db.add(Voucher(code="HEMAT25", value=25000, expiry_date=utcnow() + timedelta(days=30), remaining_usage=20))
        db.add(Promo(code="PROMO10", percent=10, expiry_date=utcnow() + timedelta(days=30)))
        db.commit()
    finally:
        db.close()


@app.on_event("startup")
def startup_event():
    seed_data()


@app.get("/")
def index():
    return FileResponse(str(BASE_DIR / "static" / "index.html"))


@app.get("/health")
def health(db: Session = Depends(get_db)):
    return {"status": "ok", "app": APP_NAME, "simulated_now": get_simulated_now(db)}


@app.post("/api/auth/register", response_model=TokenOut)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status_code=400, detail="Username sudah digunakan")
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status_code=400, detail="Email sudah digunakan")
    roles = [r.value for r in payload.roles]
    if "Admin" in roles:
        raise HTTPException(status_code=403, detail="Admin dibuat melalui seed data atau setup khusus")
    user = create_user(db, sanitize_text(payload.username), payload.email, payload.password, roles)
    active = roles[0] if len(roles) == 1 else None
    return TokenOut(access_token=create_token(user, active), roles=roles, active_role=active, needs_role_selection=active is None)


@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Username atau password salah")
    roles = user.roles
    active = roles[0] if len(roles) == 1 else None
    return TokenOut(access_token=create_token(user, active), roles=roles, active_role=active, needs_role_selection=active is None)


@app.post("/api/auth/choose-role", response_model=TokenOut)
def choose_role(payload: ChooseRoleIn, current: tuple[User, Optional[str]] = Depends(get_current_user)):
    user, _active = current
    role = payload.role.value
    if role not in user.roles:
        raise HTTPException(status_code=403, detail="Role tidak dimiliki user")
    return TokenOut(access_token=create_token(user, role), roles=user.roles, active_role=role, needs_role_selection=False)


@app.post("/api/auth/logout")
def logout():
    return {"message": "Logout berhasil. Hapus token di client."}


@app.get("/api/me")
def me(current: tuple[User, Optional[str]] = Depends(get_current_user), db: Session = Depends(get_db)):
    user, active_role = current
    summary = {"wallet_balance": None, "seller_store": None, "driver_completed_jobs": None}
    if "Buyer" in user.roles:
        summary["wallet_balance"] = get_wallet_balance(db, user.id)
    if "Seller" in user.roles:
        store = db.scalar(select(Store).where(Store.seller_id == user.id))
        summary["seller_store"] = {"id": store.id, "name": store.name} if store else None
    if "Driver" in user.roles:
        completed = db.scalar(select(func.count(DeliveryJob.id)).where(DeliveryJob.driver_id == user.id, DeliveryJob.status == "Completed"))
        summary["driver_completed_jobs"] = completed or 0
    return {**user_to_dict(user, active_role), "financial_summary_placeholder": summary}


@app.get("/api/products")
def list_products(db: Session = Depends(get_db)):
    products = db.scalars(select(Product).order_by(Product.id.asc())).all()
    return [product_public_dict(p) for p in products]


@app.get("/api/products/{product_id}")
def product_detail(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    return product_public_dict(product)


@app.get("/api/stores/{store_id}")
def store_detail(store_id: int, db: Session = Depends(get_db)):
    store = db.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store tidak ditemukan")
    return {
        "id": store.id,
        "name": store.name,
        "description": store.description,
        "seller_id": store.seller_id,
        "products": [product_public_dict(p) for p in store.products],
    }


@app.get("/api/reviews")
def list_reviews(db: Session = Depends(get_db)):
    reviews = db.scalars(select(ApplicationReview).order_by(ApplicationReview.created_at.desc())).all()
    return [
        {"id": r.id, "reviewer_name": r.reviewer_name, "rating": r.rating, "comment": r.comment, "created_at": r.created_at}
        for r in reviews
    ]


@app.post("/api/reviews", status_code=201)
def create_review(payload: ReviewIn, db: Session = Depends(get_db)):
    review = ApplicationReview(
        reviewer_name=sanitize_text(payload.reviewer_name),
        rating=payload.rating,
        comment=sanitize_text(payload.comment),
        created_at=get_simulated_now(db),
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return {"message": "Review aplikasi berhasil dikirim", "review": {"id": review.id, "reviewer_name": review.reviewer_name, "rating": review.rating, "comment": review.comment, "created_at": review.created_at}}


@app.get("/api/seller/store")
def seller_get_store(seller: User = Depends(require_role("Seller")), db: Session = Depends(get_db)):
    store = db.scalar(select(Store).where(Store.seller_id == seller.id))
    if not store:
        return None
    return {"id": store.id, "name": store.name, "description": store.description, "created_at": store.created_at}


@app.post("/api/seller/store")
def seller_upsert_store(payload: StoreIn, seller: User = Depends(require_role("Seller")), db: Session = Depends(get_db)):
    name = sanitize_text(payload.name)
    existing = db.scalar(select(Store).where(Store.name == name, Store.seller_id != seller.id))
    if existing:
        raise HTTPException(status_code=400, detail="Nama toko sudah digunakan")
    store = db.scalar(select(Store).where(Store.seller_id == seller.id))
    if not store:
        store = Store(seller_id=seller.id, name=name, description=sanitize_text(payload.description), created_at=get_simulated_now(db))
        db.add(store)
    else:
        store.name = name
        store.description = sanitize_text(payload.description)
    db.commit()
    db.refresh(store)
    return {"id": store.id, "name": store.name, "description": store.description, "message": "Store tersimpan"}


@app.get("/api/seller/products")
def seller_products(seller: User = Depends(require_role("Seller")), db: Session = Depends(get_db)):
    store = db.scalar(select(Store).where(Store.seller_id == seller.id))
    if not store:
        return []
    return [product_public_dict(p) for p in db.scalars(select(Product).where(Product.store_id == store.id)).all()]


@app.post("/api/seller/products", status_code=201)
def seller_create_product(payload: ProductIn, seller: User = Depends(require_role("Seller")), db: Session = Depends(get_db)):
    store = db.scalar(select(Store).where(Store.seller_id == seller.id))
    if not store:
        raise HTTPException(status_code=400, detail="Buat store terlebih dahulu")
    product = Product(
        store_id=store.id,
        name=sanitize_text(payload.name),
        description=sanitize_text(payload.description),
        price=payload.price,
        stock=payload.stock,
        created_at=get_simulated_now(db),
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product_public_dict(product)


@app.put("/api/seller/products/{product_id}")
def seller_update_product(product_id: int, payload: ProductIn, seller: User = Depends(require_role("Seller")), db: Session = Depends(get_db)):
    store = db.scalar(select(Store).where(Store.seller_id == seller.id))
    product = db.get(Product, product_id)
    if not store or not product or product.store_id != store.id:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan atau bukan milik Seller ini")
    product.name = sanitize_text(payload.name)
    product.description = sanitize_text(payload.description)
    product.price = payload.price
    product.stock = payload.stock
    db.commit()
    db.refresh(product)
    return product_public_dict(product)


@app.delete("/api/seller/products/{product_id}")
def seller_delete_product(product_id: int, seller: User = Depends(require_role("Seller")), db: Session = Depends(get_db)):
    store = db.scalar(select(Store).where(Store.seller_id == seller.id))
    product = db.get(Product, product_id)
    if not store or not product or product.store_id != store.id:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan atau bukan milik Seller ini")
    db.delete(product)
    db.commit()
    return {"message": "Produk dihapus"}


@app.get("/api/seller/orders")
def seller_orders(seller: User = Depends(require_role("Seller")), db: Session = Depends(get_db)):
    orders = db.scalars(select(Order).where(Order.seller_id == seller.id).order_by(Order.created_at.desc())).all()
    return [order_dict(o) for o in orders]


@app.post("/api/seller/orders/{order_id}/process")
def seller_process_order(order_id: int, seller: User = Depends(require_role("Seller")), db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if not order or order.seller_id != seller.id:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan untuk Seller ini")
    if order.status != "Sedang Dikemas":
        raise HTTPException(status_code=400, detail="Hanya order Sedang Dikemas yang dapat diproses")
    set_status(db, order, "Menunggu Pengirim", "Seller memproses order dan menunggu Driver")
    if not order.delivery_job:
        db.add(DeliveryJob(order_id=order.id, status="Available", created_at=get_simulated_now(db)))
    db.commit()
    db.refresh(order)
    return order_dict(order)


@app.get("/api/seller/report")
def seller_report(seller: User = Depends(require_role("Seller")), db: Session = Depends(get_db)):
    orders = db.scalars(select(Order).where(Order.seller_id == seller.id)).all()
    completed = [o for o in orders if o.status == "Pesanan Selesai"]
    returned = [o for o in orders if o.status == "Dikembalikan"]
    income = sum((o.subtotal - o.discount) for o in completed)
    return {
        "completed_orders": len(completed),
        "returned_orders": len(returned),
        "income_rule": "Seller income = subtotal - discount untuk order berstatus Pesanan Selesai. Delivery fee dan PPN tidak dihitung sebagai income Seller.",
        "income": income,
        "orders": [order_dict(o) for o in orders],
    }


@app.get("/api/buyer/wallet")
def buyer_wallet(buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    txs = db.scalars(select(WalletTransaction).where(WalletTransaction.buyer_id == buyer.id).order_by(WalletTransaction.created_at.desc())).all()
    return {
        "balance": get_wallet_balance(db, buyer.id),
        "transactions": [{"id": t.id, "kind": t.kind, "amount": t.amount, "note": t.note, "created_at": t.created_at} for t in txs],
    }


@app.post("/api/buyer/wallet/topup")
def buyer_topup(payload: TopupIn, buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    db.add(WalletTransaction(buyer_id=buyer.id, kind="TOPUP", amount=payload.amount, note="Dummy top-up", created_at=get_simulated_now(db)))
    db.commit()
    return buyer_wallet(buyer, db)


@app.get("/api/buyer/addresses")
def buyer_addresses(buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    addrs = db.scalars(select(Address).where(Address.buyer_id == buyer.id).order_by(Address.created_at.desc())).all()
    return [{"id": a.id, "recipient_name": a.recipient_name, "phone": a.phone, "full_address": a.full_address, "created_at": a.created_at} for a in addrs]


@app.post("/api/buyer/addresses", status_code=201)
def buyer_create_address(payload: AddressIn, buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    addr = Address(
        buyer_id=buyer.id,
        recipient_name=sanitize_text(payload.recipient_name),
        phone=sanitize_text(payload.phone),
        full_address=sanitize_text(payload.full_address),
        created_at=get_simulated_now(db),
    )
    db.add(addr)
    db.commit()
    db.refresh(addr)
    return {"id": addr.id, "recipient_name": addr.recipient_name, "phone": addr.phone, "full_address": addr.full_address, "created_at": addr.created_at}


@app.get("/api/buyer/cart")
def buyer_cart(buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    return cart_summary_for_buyer(db, buyer.id)


@app.post("/api/buyer/cart/items", status_code=201)
def buyer_add_cart(payload: CartAddIn, buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    product = db.get(Product, payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    if payload.quantity > product.stock:
        raise HTTPException(status_code=400, detail="Quantity melebihi stok")
    cart = list(db.scalars(select(CartItem).where(CartItem.buyer_id == buyer.id)).all())
    if cart and any(item.product.store_id != product.store_id for item in cart):
        raise HTTPException(status_code=400, detail="Single-store checkout: cart hanya boleh berisi produk dari satu toko. Kosongkan cart sebelum menambah produk toko lain.")
    existing = db.scalar(select(CartItem).where(CartItem.buyer_id == buyer.id, CartItem.product_id == product.id))
    if existing:
        new_qty = existing.quantity + payload.quantity
        if new_qty > product.stock:
            raise HTTPException(status_code=400, detail="Quantity total melebihi stok")
        existing.quantity = new_qty
    else:
        db.add(CartItem(buyer_id=buyer.id, product_id=product.id, quantity=payload.quantity))
    db.commit()
    return cart_summary_for_buyer(db, buyer.id)


@app.patch("/api/buyer/cart/items/{cart_item_id}")
def buyer_update_cart(cart_item_id: int, payload: CartUpdateIn, buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    item = db.get(CartItem, cart_item_id)
    if not item or item.buyer_id != buyer.id:
        raise HTTPException(status_code=404, detail="Item cart tidak ditemukan")
    if payload.quantity > item.product.stock:
        raise HTTPException(status_code=400, detail="Quantity melebihi stok")
    item.quantity = payload.quantity
    db.commit()
    return cart_summary_for_buyer(db, buyer.id)


@app.delete("/api/buyer/cart/items/{cart_item_id}")
def buyer_delete_cart(cart_item_id: int, buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    item = db.get(CartItem, cart_item_id)
    if not item or item.buyer_id != buyer.id:
        raise HTTPException(status_code=404, detail="Item cart tidak ditemukan")
    db.delete(item)
    db.commit()
    return cart_summary_for_buyer(db, buyer.id)


@app.delete("/api/buyer/cart")
def buyer_clear_cart(buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    for item in db.scalars(select(CartItem).where(CartItem.buyer_id == buyer.id)).all():
        db.delete(item)
    db.commit()
    return {"message": "Cart dikosongkan", "items": [], "subtotal": 0}


@app.post("/api/buyer/checkout/summary")
def buyer_checkout_summary(payload: CheckoutIn, buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    addr = db.get(Address, payload.address_id)
    if not addr or addr.buyer_id != buyer.id:
        raise HTTPException(status_code=404, detail="Alamat tidak ditemukan")
    return build_checkout_summary(db, buyer.id, payload.delivery_method, payload.discount_code)


@app.post("/api/buyer/checkout")
def buyer_checkout(payload: CheckoutIn, buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    address = db.get(Address, payload.address_id)
    if not address or address.buyer_id != buyer.id:
        raise HTTPException(status_code=404, detail="Alamat tidak ditemukan")
    summary = build_checkout_summary(db, buyer.id, payload.delivery_method, payload.discount_code)
    balance = get_wallet_balance(db, buyer.id)
    if balance < summary["final_total"]:
        raise HTTPException(status_code=400, detail="Saldo wallet tidak cukup")
    # Safety re-check before mutation.
    product_ids = [row["product_id"] for row in summary["items"]]
    products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(product_ids))).all()}
    for row in summary["items"]:
        p = products.get(row["product_id"])
        if not p or p.stock < row["quantity"]:
            raise HTTPException(status_code=400, detail=f"Stok produk {row['product_name']} tidak cukup")

    first_product = products[summary["items"][0]["product_id"]]
    store = first_product.store
    order = Order(
        buyer_id=buyer.id,
        store_id=store.id,
        seller_id=store.seller_id,
        address_snapshot=f"{address.recipient_name} | {address.phone} | {address.full_address}",
        delivery_method=payload.delivery_method,
        subtotal=summary["subtotal"],
        discount=summary["discount"],
        discount_code=summary["discount_code"],
        discount_type=summary["discount_type"],
        delivery_fee=summary["delivery_fee"],
        ppn=summary["ppn"],
        final_total=summary["final_total"],
        status="Sedang Dikemas",
        created_at=get_simulated_now(db),
    )
    db.add(order)
    db.flush()
    for row in summary["items"]:
        p = products[row["product_id"]]
        p.stock -= row["quantity"]
        db.add(OrderItem(order_id=order.id, product_id=p.id, product_name=p.name, price=p.price, quantity=row["quantity"]))
    db.add(WalletTransaction(buyer_id=buyer.id, kind="CHECKOUT", amount=-summary["final_total"], note=f"Pembayaran order #{order.id}", created_at=get_simulated_now(db)))
    db.add(OrderStatusHistory(order_id=order.id, status="Sedang Dikemas", note="Order berhasil dibuat dan sedang dikemas Seller", created_at=get_simulated_now(db)))
    if summary["discount_type"] == "Voucher" and summary["discount_code"]:
        voucher = db.scalar(select(Voucher).where(Voucher.code == summary["discount_code"]))
        if voucher:
            voucher.remaining_usage -= 1
    for item in db.scalars(select(CartItem).where(CartItem.buyer_id == buyer.id)).all():
        db.delete(item)
    db.commit()
    db.refresh(order)
    return {"message": "Checkout berhasil", "order": order_dict(order)}


@app.get("/api/buyer/orders")
def buyer_orders(buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    orders = db.scalars(select(Order).where(Order.buyer_id == buyer.id).order_by(Order.created_at.desc())).all()
    return [order_dict(o) for o in orders]


@app.get("/api/buyer/orders/{order_id}")
def buyer_order_detail(order_id: int, buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if not order or order.buyer_id != buyer.id:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    return order_dict(order)


@app.get("/api/buyer/report")
def buyer_report(buyer: User = Depends(require_role("Buyer")), db: Session = Depends(get_db)):
    orders = db.scalars(select(Order).where(Order.buyer_id == buyer.id)).all()
    paid_orders = [o for o in orders if not o.is_refunded]
    returned_orders = [o for o in orders if o.is_refunded]
    return {
        "spending": sum(o.final_total for o in paid_orders if o.status != "Dikembalikan"),
        "returned_or_refunded": sum(o.final_total for o in returned_orders),
        "order_count": len(orders),
        "orders": [order_dict(o) for o in orders],
    }


@app.get("/api/driver/jobs/available")
def driver_available_jobs(driver: User = Depends(require_role("Driver")), db: Session = Depends(get_db)):
    jobs = db.scalars(select(DeliveryJob).where(DeliveryJob.status == "Available").order_by(DeliveryJob.created_at.asc())).all()
    return [
        {"job_id": j.id, "order": order_dict(j.order), "status": j.status, "created_at": j.created_at}
        for j in jobs
        if j.order.status == "Menunggu Pengirim"
    ]


@app.get("/api/driver/dashboard")
def driver_dashboard(driver: User = Depends(require_role("Driver")), db: Session = Depends(get_db)):
    jobs = db.scalars(select(DeliveryJob).where(DeliveryJob.driver_id == driver.id).order_by(DeliveryJob.created_at.desc())).all()
    return {
        "earning_rule": "Driver earning = 80% dari delivery fee untuk job yang sudah Completed.",
        "earnings": sum(j.order.driver_earning for j in jobs if j.status == "Completed"),
        "active_jobs": [{"job_id": j.id, "order": order_dict(j.order), "status": j.status} for j in jobs if j.status == "Taken"],
        "job_history": [{"job_id": j.id, "order": order_dict(j.order), "status": j.status, "created_at": j.created_at, "completed_at": j.completed_at} for j in jobs],
    }


@app.post("/api/driver/jobs/{job_id}/take")
def driver_take_job(job_id: int, driver: User = Depends(require_role("Driver")), db: Session = Depends(get_db)):
    job = db.get(DeliveryJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")
    if job.status != "Available" or job.driver_id is not None or job.order.status != "Menunggu Pengirim":
        raise HTTPException(status_code=400, detail="Job sudah diambil atau belum siap")
    job.status = "Taken"
    job.driver_id = driver.id
    job.taken_at = get_simulated_now(db)
    job.order.driver_id = driver.id
    set_status(db, job.order, "Sedang Dikirim", "Driver mengambil job dan sedang mengirim pesanan")
    db.commit()
    db.refresh(job)
    return {"message": "Job berhasil diambil", "job_id": job.id, "order": order_dict(job.order)}


@app.post("/api/driver/jobs/{job_id}/complete")
def driver_complete_job(job_id: int, driver: User = Depends(require_role("Driver")), db: Session = Depends(get_db)):
    job = db.get(DeliveryJob, job_id)
    if not job or job.driver_id != driver.id:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan untuk Driver ini")
    if job.status != "Taken" or job.order.status != "Sedang Dikirim":
        raise HTTPException(status_code=400, detail="Job tidak dalam status pengiriman")
    job.status = "Completed"
    job.completed_at = get_simulated_now(db)
    job.order.completed_at = get_simulated_now(db)
    job.order.driver_earning = round(job.order.delivery_fee * DRIVER_EARNING_RATE, 2)
    set_status(db, job.order, "Pesanan Selesai", "Driver mengonfirmasi pesanan selesai")
    db.commit()
    db.refresh(job)
    return {"message": "Job selesai", "job_id": job.id, "earning": job.order.driver_earning, "order": order_dict(job.order)}


@app.get("/api/admin/dashboard")
def admin_dashboard(admin: User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    overdue = find_overdue_orders(db)
    return {
        "simulated_now": get_simulated_now(db),
        "users": db.scalar(select(func.count(User.id))) or 0,
        "stores": db.scalar(select(func.count(Store.id))) or 0,
        "products": db.scalar(select(func.count(Product.id))) or 0,
        "orders": db.scalar(select(func.count(Order.id))) or 0,
        "vouchers": db.scalar(select(func.count(Voucher.id))) or 0,
        "promos": db.scalar(select(func.count(Promo.id))) or 0,
        "delivery_jobs": db.scalar(select(func.count(DeliveryJob.id))) or 0,
        "overdue_orders": [order_dict(o) for o in overdue],
        "status_summary": {status: db.scalar(select(func.count(Order.id)).where(Order.status == status)) or 0 for status in MAIN_STATUSES},
    }


@app.get("/api/admin/users")
def admin_users(admin: User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    return [user_to_dict(u) for u in db.scalars(select(User).order_by(User.id.asc())).all()]


@app.get("/api/admin/stores")
def admin_stores(admin: User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    return [{"id": s.id, "name": s.name, "seller_id": s.seller_id, "description": s.description} for s in db.scalars(select(Store)).all()]


@app.get("/api/admin/orders")
def admin_orders(admin: User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    return [order_dict(o) for o in db.scalars(select(Order).order_by(Order.created_at.desc())).all()]


@app.get("/api/admin/vouchers")
def admin_vouchers(admin: User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    return [{"id": v.id, "code": v.code, "value": v.value, "expiry_date": v.expiry_date, "remaining_usage": v.remaining_usage} for v in db.scalars(select(Voucher)).all()]


@app.post("/api/admin/vouchers", status_code=201)
def admin_create_voucher(payload: VoucherIn, admin: User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    code = sanitize_text(payload.code).upper()
    if db.scalar(select(Voucher).where(Voucher.code == code)) or db.scalar(select(Promo).where(Promo.code == code)):
        raise HTTPException(status_code=400, detail="Kode diskon sudah digunakan")
    voucher = Voucher(code=code, value=payload.value, expiry_date=get_simulated_now(db) + timedelta(days=payload.expiry_days), remaining_usage=payload.remaining_usage, created_at=get_simulated_now(db))
    db.add(voucher)
    db.commit()
    db.refresh(voucher)
    return {"id": voucher.id, "code": voucher.code, "value": voucher.value, "expiry_date": voucher.expiry_date, "remaining_usage": voucher.remaining_usage}


@app.get("/api/admin/promos")
def admin_promos(admin: User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    return [{"id": p.id, "code": p.code, "percent": p.percent, "expiry_date": p.expiry_date} for p in db.scalars(select(Promo)).all()]


@app.post("/api/admin/promos", status_code=201)
def admin_create_promo(payload: PromoIn, admin: User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    code = sanitize_text(payload.code).upper()
    if db.scalar(select(Voucher).where(Voucher.code == code)) or db.scalar(select(Promo).where(Promo.code == code)):
        raise HTTPException(status_code=400, detail="Kode diskon sudah digunakan")
    promo = Promo(code=code, percent=payload.percent, expiry_date=get_simulated_now(db) + timedelta(days=payload.expiry_days), created_at=get_simulated_now(db))
    db.add(promo)
    db.commit()
    db.refresh(promo)
    return {"id": promo.id, "code": promo.code, "percent": promo.percent, "expiry_date": promo.expiry_date}


def find_overdue_orders(db: Session) -> list[Order]:
    now = get_simulated_now(db)
    orders = db.scalars(select(Order).where(Order.status.in_(["Sedang Dikemas", "Menunggu Pengirim", "Sedang Dikirim"]), Order.is_refunded == False)).all()  # noqa: E712
    overdue = []
    for order in orders:
        sla_days = DELIVERY_SLA_DAYS[order.delivery_method]
        if order.created_at + timedelta(days=sla_days) < now:
            overdue.append(order)
    return overdue


def apply_overdue_refund(db: Session, order: Order) -> None:
    if order.is_refunded or order.status == "Dikembalikan":
        return
    order.is_refunded = True
    db.add(WalletTransaction(buyer_id=order.buyer_id, kind="REFUND", amount=order.final_total, note=f"Auto refund order #{order.id} karena overdue", created_at=get_simulated_now(db)))
    for item in order.items:
        product = db.get(Product, item.product_id)
        if product:
            product.stock += item.quantity
    if order.delivery_job and order.delivery_job.status != "Completed":
        order.delivery_job.status = "Returned"
    set_status(db, order, "Dikembalikan", f"Auto return/refund karena melewati SLA {order.delivery_method}")


@app.post("/api/admin/simulate-next-day")
def admin_simulate_next_day(admin: User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    state = db.get(AppState, "day_offset")
    if not state:
        state = AppState(key="day_offset", value="0")
        db.add(state)
        db.flush()
    state.value = str(int(state.value) + 1)
    overdue = find_overdue_orders(db)
    for order in overdue:
        apply_overdue_refund(db, order)
    db.commit()
    return {"message": "Simulasi next day berjalan", "simulated_now": get_simulated_now(db), "overdue_handled": [o.id for o in overdue]}


@app.post("/api/admin/run-overdue-check")
def admin_run_overdue(admin: User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    overdue = find_overdue_orders(db)
    for order in overdue:
        apply_overdue_refund(db, order)
    db.commit()
    return {"message": "Overdue check selesai", "overdue_handled": [o.id for o in overdue]}
