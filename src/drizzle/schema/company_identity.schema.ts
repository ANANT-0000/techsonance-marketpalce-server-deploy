import * as pg from 'drizzle-orm/pg-core';
import { company } from './main.schema';
import { address, user } from './users.schema';
import { company_document, templates } from './utils.schema';

// ================================================================
// COMPANY IDENTITY SCHEMA
// Covers: branding, legal profile, country compliance, and
// document generation configuration.
//
// These tables are the source of truth for the PDF/document
// generation service when producing invoices, warranty cards,
// GST documents, etc. for each company on the multi-tenant server.
// ================================================================

// ─── 1. COMPANY BRANDING ────────────────────────────────────────
// One row per company (enforced by .unique() on company_id).
// Everything the PDF renderer needs to paint document headers,
// watermarks, and brand-consistent styling.
export const company_branding = pg.pgTable('company_branding', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  company_id: pg
    .uuid('company_id')
    .notNull()
    .unique()
    .references(() => company.id, { onDelete: 'cascade' }),

  // ── Logos ──
  // Primary logo — used in invoice header, warranty card header, email header
  logo_url: pg.text('logo_url').notNull(),
  // Dark / inverted variant — for dark-background sections in PDFs
  logo_dark_url: pg.text('logo_dark_url'),
  // Watermark — faint background stamp placed behind invoice content
  watermark_url: pg.text('watermark_url'),
  // Favicon — used in transactional emails, not PDFs
  favicon_url: pg.text('favicon_url'),

  // ── Brand Palette (hex strings, e.g. "#1A73E8") ──
  // Used to color invoice table headers, section accents, borders
  primary_color: pg.varchar('primary_color', { length: 7 }).default('#000000'),
  secondary_color: pg.varchar('secondary_color', { length: 7 }),
  accent_color: pg.varchar('accent_color', { length: 7 }),

  // ── Typography ──
  // Must be a font available in your PDF renderer (Puppeteer / PDFKit / WeasyPrint)
  font_family: pg.text('font_family').default('Inter'),

  // ── Storefront Layout & Themes ──
  background_color: pg.varchar('background_color', { length: 7 }).default('#f8fafc'),
  text_color: pg.varchar('text_color', { length: 7 }).default('#0f172a'),
  navbar_bg: pg.varchar('navbar_bg', { length: 7 }).default('#ffffff'),
  navbar_fg: pg.varchar('navbar_fg', { length: 7 }).default('#0f172a'),
  footer_bg: pg.varchar('footer_bg', { length: 7 }).default('#0f172a'),
  footer_fg: pg.varchar('footer_fg', { length: 7 }).default('#ffffff'),
  navbar_position: pg.varchar('navbar_position', { length: 20 }).default('sticky'),
  logo_alignment: pg.varchar('logo_alignment', { length: 20 }).default('left'),
  footer_style: pg.varchar('footer_style', { length: 20 }).default('detailed'),
  border_radius: pg.varchar('border_radius', { length: 20 }).default('md'),
  card_style: pg.varchar('card_style', { length: 20 }).default('standard'),
  homepage_layout: pg.jsonb('homepage_layout').default(['hero', 'categories', 'products', 'promo', 'new_arrivals', 'newsletter']),

  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ─── 2. COMPANY LEGAL PROFILE ───────────────────────────────────
// One row per company. Printed on every invoice, GST document,
// and warranty card as the "Sold by" / "Issued by" block.
// Holds the legal name, registered address, and base Indian
// identifiers. Country-specific tax IDs live in company_compliance.
export const company_legal_profile = pg.pgTable('company_legal_profile', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  company_id: pg
    .uuid('company_id')
    .notNull()
    .unique()
    .references(() => company.id, { onDelete: 'cascade' }),

  // ── Legal Identity ──
  // Must match the name on tax registration documents exactly
  legal_name: pg.text('legal_name').notNull(),
  // Trade / brand name shown to customers (can differ from legal name)

  // Country of incorporation — drives which compliance fields are shown
  // ISO 3166-1 alpha-2, e.g. "IN", "US", "GB"
  country_code: pg.varchar('country_code', { length: 2 }).notNull(),

  // ── Registered Address ──
  // FK to your existing address table — the official registered office
  registered_address_id: pg
    .uuid('registered_address_id')
    .references(() => address.id),
  // ── Contact Printed on Document Footer ──
  support_email: pg.text('support_email'),
  support_phone: pg.text('support_phone'),
  website_url: pg.text('website_url'),

  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ─── 3. COMPANY COMPLIANCE (Country-Specific Tax/Legal IDs) ─────
// One row per compliance field per country per company.
// Maps 1:1 to your existing CountryCompliance[] in common.ts —
// field_key matches the `value` in that array.
//
// Examples:
//   India  → { field_key: 'gst_number', field_value: '24ABCDE1234FIZ5' }
//   US     → { field_key: 'ein',         field_value: '12-3456789'       }
//   EU/NL  → { field_key: 'kvk',         field_value: '12345678'         }
//   UK     → { field_key: 'vat_number',  field_value: 'GB123456789'      }
//
// The document generation service queries these by company_id +
// country_code to determine what identifiers to print on an invoice.
export const company_compliance = pg.pgTable(
  'company_compliance',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),

    // ISO 3166-1 alpha-2 country this registration belongs to
    country_code: pg.varchar('country_code', { length: 2 }).notNull(),

    // Matches the `value` key in your CountryCompliance fields array
    // e.g. 'gst_number', 'ein', 'vat_number', 'kvk', 'pan_number'
    field_key: pg.text('field_key').notNull(),

    // The actual registration value
    field_value: pg.text('field_value').notNull(),

    // Examples:
    // field_details :[
    //   for valid registrations  → { field_key: 'valid_from', field_value: '2023-01-01' }
    //   for valid to registrations  → { field_key: 'valid_to', field_value: '2023-12-31' }
    // ]
    field_details: pg.jsonb('field_details').default('[]'),
    // Optional JSON for extra metadata (e.g. GST state code)

    document_id: pg
      .uuid('document_id')
      .references(() => company_document.id, { onDelete: 'set null' }),

    // Whether this registration is currently valid / active
    is_active: pg.boolean('is_active').notNull().default(true),

    // For registrations that expire (GST, VAT, etc.)
    valid_until: pg.date('valid_until'),
    display_name: pg.text('display_name'),
    rejection_reason: pg.text('rejection_reason'),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    verified_by: pg.uuid('verified_by').references(() => user.id),
  },
  (table) => [
    // One value per field_key per country per company — no duplicates
    pg
      .uniqueIndex('uq_company_compliance')
      .on(table.company_id, table.country_code, table.field_key),
    // Fast lookup by company + country (used on every invoice generation)
    pg
      .index('idx_compliance_company_country')
      .on(table.company_id, table.country_code),
    pg.index('idx_compliance_company_id').on(table.company_id),
  ],
);

// ─── 4. COMPANY DOCUMENT CONFIG ─────────────────────────────────
// One row per company. Server-side PDF generation preferences.
// Controls invoice numbering format, default template selection,
// signatory block, and footer/terms text.
//
// NOTE on invoice templates:
//   Your existing `invoiceTemplate` table (utils.schema.ts) stores
//   the actual visual templates linked to company + vendor.
//   Vendors pick their own template from that table.
//   This table stores the *document generation metadata* that wraps
//   any template — numbering, signatory, footer — not the template itself.
export const company_document_config = pg.pgTable('company_document_config', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  company_id: pg
    .uuid('company_id')
    .notNull()
    .unique()
    .references(() => company.id, { onDelete: 'cascade' }),

  // ── Invoice Numbering ──
  // Prefix printed before the sequence number
  // e.g. "INV", "TAX-INV", "SINV"
  invoice_number_prefix: pg.text('invoice_number_prefix').default('INV'),

  // Format string — tokens replaced at generation time:
  //   {PREFIX} → invoice_number_prefix above
  //   {YYYY}   → 4-digit year
  //   {MM}     → 2-digit month
  //   {SEQ6}   → 6-digit zero-padded sequence (per company, per year)
  //   {SEQ8}   → 8-digit zero-padded sequence
  // e.g. "INV-2026-00000001", "TAX/2026-27/0001"
  invoice_number_format: pg
    .text('invoice_number_format')
    .default('{PREFIX}-{YYYY}-{SEQ8}'),

  // Current sequence counter — incremented atomically on each invoice generation
  // Store here so the server doesn't need a separate counter table
  invoice_sequence_counter: pg.integer('invoice_sequence_counter').default(0),

  // Which financial year the counter resets on (for Indian FY: April)
  // "CALENDAR" → resets on Jan 1  |  "APRIL" → resets on Apr 1
  invoice_sequence_reset: pg.text('invoice_sequence_reset').default('APRIL'),

  // ── Default Invoice Template ──

  default_invoice_template_id: pg
    .uuid('default_invoice_template_id')
    .references(() => templates.id),

  // ── Signatory Block ──
  // Printed at the bottom-right of invoices as "Authorized Signatory"
  signatory_name: pg.text('signatory_name'),
  signatory_designation: pg.text('signatory_designation'),
  // URL to the signature image (PNG with transparent bg, uploaded to S3/CDN)
  signatory_signature_url: pg.text('signatory_signature_url'),

  // ── Invoice Footer & Terms ──
  // Footer line printed at the very bottom of every invoice page
  // e.g. "Thank you for shopping with us. All disputes subject to Surat jurisdiction."
  invoice_footer_text: pg.text('invoice_footer_text'),
  // Full T&C block printed on last page or as a section
  invoice_terms_and_conditions: pg.text('invoice_terms_and_conditions'),

  // ── Output Locale Defaults ──
  // Used when formatting currency amounts, dates on PDFs
  default_currency: pg
    .varchar('default_currency', { length: 3 })
    .default('INR'),
  default_timezone: pg.text('default_timezone').default('Asia/Kolkata'),
  // Date format string for PDF output
  // e.g. "DD/MM/YYYY", "MM-DD-YYYY", "YYYY-MM-DD"
  date_format: pg.text('date_format').default('DD/MM/YYYY'),

  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
