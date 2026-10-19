/**
 * DEPRECATED.
 *
 * Takip numaraları artık parent Action üzerinden, immutable olarak üretilir.
 * Eski kayıtların güvenli ve deterministik dönüşümü şu migration içindedir:
 *   20261006120000_hierarchical_business_identifiers
 *
 * Bu dosya özellikle veri değiştirmez. Eski tek-seferlik script, yeni DB
 * immutability trigger'ını aşmaya çalışacağı ve hiyerarşik sıra garantisini
 * bozacağı için bilinçli olarak devre dışı bırakılmıştır.
 */
throw new Error(
    'Bu script kullanımdan kaldırıldı. Hiyerarşik business identifier migration dosyasını kontrollü deployment akışında uygulayın.',
);
