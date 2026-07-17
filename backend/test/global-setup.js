// Jest globalSetup — tüm e2e test dosyalarından ÖNCE bir kez çalışır.
// grc_db_test şemasını mevcut Prisma şemasıyla senkronize eder.
const path = require('path');
const dotenv = require('dotenv');
const { execSync } = require('child_process');

module.exports = async () => {
    dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

    console.log('\n[globalSetup] grc_db_test şeması senkronize ediliyor...');
    execSync('npx prisma db push --accept-data-loss', {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env },
        stdio: 'inherit',
    });
    console.log('[globalSetup] Şema hazır.\n');
};
