// Jest globalTeardown — tüm e2e test dosyaları bittikten sonra bir kez çalışır.
// Şu an ek bir işlem gerekmiyor (her test dosyası kendi Prisma bağlantısını kapatır);
// ileride test DB'sini tamamen DROP etmek istenirse buraya eklenebilir.
module.exports = async () => {};
