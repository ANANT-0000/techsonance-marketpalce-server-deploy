import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import 'dotenv/config';
import { cms_pages, company } from './src/drizzle/schema';
import { eq, and } from 'drizzle-orm';

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log('Querying companies...');
  const companies = await db.select().from(company);
  console.log('Existing companies:', companies.map(c => ({ id: c.id, name: c.company_name, domain: c.company_domain })));

  if (companies.length === 0) {
    console.log('No companies found in database!');
    await pool.end();
    return;
  }

  // Try to find the ee4d1d83-6431-4d70-b79e-e537e892eea5 one or fallback
  const targetCompany = companies.find(c => c.id === 'ee4d1d83-6431-4d70-b79e-e537e892eea5') || companies[0];
  console.log('Target company ID:', targetCompany.id);

  // Content JSON
  const homeContentEn = {
    hero_title: "Welcome to Sound Sphere - Your Ultimate Music Marketplace",
    hero_desc: "Discover, buy, and sell music products with ease. Join our vibrant community of music lovers and elevate your sound experience today!",
    hero_btn_text: "Shop Now",
    brand_features: [
      { "title": "Secure Payment", "icon": "wallet" },
      { "title": "Free Shipping", "icon": "package" },
      { "title": "Delivered with Care", "icon": "truck" },
      { "title": "High Quality Audio", "icon": "audio-lines" }
    ],
    best_selling_title: "Fender Stratocaster Electric Guitar",
    best_selling_desc: "Experience the iconic sound and playability of the Fender Stratocaster Electric Guitar. Perfect for musicians of all levels, this guitar delivers classic tones and exceptional performance. Whether you're a beginner or a seasoned pro, the Stratocaster is your ticket to musical greatness.",
    best_selling_satisfaction: "98%",
    feedback_list: [
      {
        "customerName": "John Doe",
        "feedback": "I had an amazing experience shopping at Sound Sphere! The website is user-friendly, and the customer service was top-notch.",
        "rating": 5
      },
      {
        "customerName": "Jane Smith",
        "feedback": "Sound Sphere has a fantastic selection of music products. I was able to find rare vinyl records that I couldn't find anywhere else.",
        "rating": 4
      }
    ]
  };

  const homeContentEs = {
    hero_title: "Bienvenido a Sound Sphere: su mercado de música definitivo",
    hero_desc: "Descubra, compre y venda productos musicales con facilidad. ¡Únase a nuestra vibrante comunidad de amantes de la música y eleve su experiencia de sonido hoy!",
    hero_btn_text: "Comprar ahora",
    brand_features: [
      { "title": "Pago Seguro", "icon": "wallet" },
      { "title": "Envío Gratis", "icon": "package" },
      { "title": "Entregado con Cuidado", "icon": "truck" },
      { "title": "Audio de Alta Calidad", "icon": "audio-lines" }
    ],
    best_selling_title: "Guitarra eléctrica Fender Stratocaster",
    best_selling_desc: "Experimente el sonido y la facilidad de ejecución icónicos de la guitarra eléctrica Fender Stratocaster. Perfecta para músicos de todos los niveles, esta guitarra ofrece tonos clásicos y un rendimiento excepcional.",
    best_selling_satisfaction: "98%",
    feedback_list: [
      {
        "customerName": "John Doe",
        "feedback": "¡Tuve una experiencia increíble comprando en Sound Sphere! El sitio web es fácil de usar y el servicio de atención al cliente fue excelente.",
        "rating": 5
      },
      {
        "customerName": "Jane Smith",
        "feedback": "Sound Sphere tiene una selección fantástica de productos musicales. Pude encontrar discos de vinilo raros que no pude encontrar en ningún otro lugar.",
        "rating": 4
      }
    ]
  };

  // Upsert English Home page
  const enPages = await db.select().from(cms_pages).where(
    and(
      eq(cms_pages.company_id, targetCompany.id),
      eq(cms_pages.page_content_type, 'home'),
      eq(cms_pages.language, 'en')
    )
  );
  if (enPages.length > 0) {
    console.log('Updating existing English home page...');
    await db.update(cms_pages).set({
      title: 'Sound Sphere Home (EN)',
      content: JSON.stringify(homeContentEn)
    }).where(eq(cms_pages.id, enPages[0].id));
  } else {
    console.log('Creating English home page...');
    await db.insert(cms_pages).values({
      title: 'Sound Sphere Home (EN)',
      content: JSON.stringify(homeContentEn),
      page_content_type: 'home',
      seo_meta: {},
      language: 'en',
      company_id: targetCompany.id
    });
  }

  // Upsert Spanish Home page
  const esPages = await db.select().from(cms_pages).where(
    and(
      eq(cms_pages.company_id, targetCompany.id),
      eq(cms_pages.page_content_type, 'home'),
      eq(cms_pages.language, 'es')
    )
  );
  if (esPages.length > 0) {
    console.log('Updating existing Spanish home page...');
    await db.update(cms_pages).set({
      title: 'Sound Sphere Home (ES)',
      content: JSON.stringify(homeContentEs)
    }).where(eq(cms_pages.id, esPages[0].id));
  } else {
    console.log('Creating Spanish home page...');
    await db.insert(cms_pages).values({
      title: 'Sound Sphere Home (ES)',
      content: JSON.stringify(homeContentEs),
      page_content_type: 'home',
      seo_meta: {},
      language: 'es',
      company_id: targetCompany.id
    });
  }

  console.log('Seeding CMS pages complete!');
  await pool.end();
}

run().catch(console.error);
