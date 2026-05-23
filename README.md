<div align="center">

# 🛍️ TechSonance Marketplace Server

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black" alt="Drizzle ORM" />
  <img src="https://img.shields.io/badge/Swagger-85EA2D?style=for-the-badge&logo=Swagger&logoColor=black" alt="Swagger" />
</p>

<p align="center">
  <b>
    A highly scalable, modular backend API built to power the TechSonance Marketplace —
    a dedicated platform for vendors to easily obtain and manage their own storefronts and websites.
  </b>
</p>

---

</div>

## 🚀 Project Overview

The **TechSonance Marketplace Server** is the central nervous system of the marketplace platform. Engineered with **NestJS**, it handles complex e-commerce logic ranging from vendor onboarding to dynamic invoice generation.

The primary goal of this platform is to provide vendors with **dedicated, customizable storefronts**, streamlining their business operations, inventory, and sales channels under one unified ecosystem.

---

# 🛠️ Architecture & Tech Stack

This project leverages a modern, type-safe stack for maximum developer productivity and application stability.

## Core Technologies

| Technology | Description |
|------------|-------------|
| **NestJS** | Robust modular Node.js framework |
| **TypeScript** | End-to-end type safety |
| **PostgreSQL** | Relational database with ACID compliance |
| **Drizzle ORM** | Lightweight type-safe ORM and query builder |

---

## 📚 Key Libraries & Integrations

### 🔐 Security
- `@nestjs/jwt`
- `passport-google-oauth20`
- `bcrypt`
- `argon2`
- `helmet`

### ☁️ Media Management
- `cloudinary`
- `multer`

### 📧 Communication
- `nodemailer`
- `resend`

### 📄 Document Generation
- `puppeteer`
- `handlebars`

### 📘 Documentation
- `@nestjs/swagger`

---

# 📦 Core Modules & Domains

The application follows a modular architecture with domain-driven design principles.

---

## 🔐 1. Authentication & Authorization (`auth`)

### Features
- JWT-based authentication
- Google OAuth 2.0 integration
- Role-based access control (RBAC)
- Secure password hashing
- HTTP-only cookie support

### Security Components
- `@Roles()` decorators
- `RoleGuard`
- JWT guards
- Password encryption using `bcrypt` and `argon2`

---

## 👥 2. User & Vendor Management (`users`, `vendors`, `company`)

### Vendor Features
- Vendor onboarding
- Dedicated storefront setup
- Company identity management
- Marketplace profile customization

### User Features
- Multi-address management
- State code management
- User profile handling

---

## 🛒 3. E-Commerce Engine (`products`, `orders`, `cart`, `checkout`)

### Product Management
- Product variants
- Categories
- Inventory tracking
- Product policies

### Shopping Features
- Shopping cart system
- Wishlist management
- Coupon and discount handling
- Checkout processing

### Post-Sale Features
- Product reviews
- Return requests
- Refund management

---

## 🎫 4. Support & Communication (`tickets`, `mail`, `invoice`)

### Ticketing System
- Customer support workflows
- Vendor support management
- Internal issue resolution

### Mail Services
Automated email templates for:
- Order placed
- Vendor approval
- Password reset
- Notifications

### Invoice System
- GST-compliant invoices
- PDF generation
- Warranty document generation
- Minimal & standard invoice formats

---

# 🛡️ Security & Global Configuration

The backend enforces strict global security and validation standards.

## Global Features

### ✅ Payload Validation
Global `ValidationPipe` configuration:
```ts
whitelist: true
````

### 🔒 HTTP Security

* Helmet protection
* CORS configuration
* Secure headers

### 🌐 CORS Policies

Dynamic origins configured through:

```env
ALLOWED_ORIGINS=
```

### 📦 Unified Response Formatting

* Global `ResponseInterceptor`
* `HttpExceptionFilter`

### 📁 Large Payload Support

Supports uploads up to:

```txt
50mb
```

---

# 🚦 Getting Started

## 📋 Prerequisites

Before starting, ensure you have:

* Node.js (v18+ recommended)
* PostgreSQL database
* Cloudinary account
* SMTP or Resend mail service

---

# 📥 Installation

```bash
# Clone the repository
git clone https://github.com/your-username/techsonance-marketplace-server.git

# Move into project directory
cd techsonance-marketplace-server

# Install dependencies
npm install
```

---

# ⚙️ Environment Configuration

Create a `.env` file in the root directory.

```env
# Application
PORT=8000
ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend-domain.com

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/techsonance_db

# JWT
JWT_SECRET=your_super_secret_key

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Mailer
RESEND_API_KEY=your_resend_api_key
SMTP_HOST=your_smtp_host
```

---

# ▶️ Running the Application

## Development Mode

```bash
npm run start
```

## Watch Mode (Hot Reload)

```bash
npm run dev
```

## Production Mode

```bash
npm run build
npm run start:prod
```

---

# 📚 API Documentation (Swagger)

Interactive API documentation is available using Swagger.

## Access Swagger

After starting the server, open:

```txt
http://localhost:<PORT>/api
```

## Authentication

Use the **Authorize** button and provide:

```txt
Bearer <JWT_TOKEN>
```

---

# 📁 Suggested Project Structure

```bash
src/
├── auth/
├── users/
├── vendors/
├── products/
├── orders/
├── cart/
├── checkout/
├── invoice/
├── mail/
├── tickets/
├── refunds/
├── returns/
├── coupon/
├── company/
├── common/
├── config/
└── main.ts
```

---

# 🧪 Available Scripts

```bash
# Start development server
npm run start

# Start with watch mode
npm run dev

# Production build
npm run build

# Start production server
npm run start:prod

# Run linting
npm run lint

# Run tests
npm run test
```

---

# 🌟 Highlights

✅ Modular scalable architecture
✅ Vendor-specific storefront support
✅ JWT + Google OAuth authentication
✅ GST-compliant invoice generation
✅ Cloudinary media uploads
✅ Swagger API documentation
✅ Drizzle ORM with PostgreSQL
✅ Advanced security configuration
✅ Automated mailing system
✅ Role-based authorization system

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push the branch
5. Open a Pull Request

---

# 📄 License

This project is licensed under the **MIT License**.

---

<div align="center">

### 💙 Built with NestJS & TypeScript

</div>
```
