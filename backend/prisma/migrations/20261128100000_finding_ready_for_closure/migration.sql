-- Bulgu çözüm durumu: tüm düzeltici aksiyonları kapanmış, kapanış değerlendirmesini bekleyen bulgu.
-- Önceden "Kısmen Kapatıldı" görünüyordu; ayrı ve okunur bir durum olarak ayrıldı.
-- (Yeni enum değeri aynı transaction'da kullanılamadığı için veri düzeltmesi sonraki migration'dadır.)
ALTER TYPE "FindingResolutionStatus" ADD VALUE IF NOT EXISTS 'KAPANISA_HAZIR' BEFORE 'KAPATILDI';
