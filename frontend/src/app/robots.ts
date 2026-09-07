import type { MetadataRoute } from 'next';

// RMIC tamamen login-korumalı bir kurumsal uygulama — public/keşfedilebilir
// içerik yok. Amaç SEO değil, arama motorlarının login ekranını, hata
// sayfalarını vb. hiç indexlememesi.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
