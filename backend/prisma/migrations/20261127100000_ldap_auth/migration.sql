-- Yerel + LDAP kimlik doğrulama. Mevcut kullanıcılar LOCAL kalır (veri değişmez).
CREATE TYPE "AuthSource" AS ENUM ('LOCAL', 'LDAP');
CREATE TYPE "LdapProtocol" AS ENUM ('LDAP', 'LDAPS');

CREATE TABLE "LdapConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "protocol" "LdapProtocol" NOT NULL DEFAULT 'LDAPS',
    "port" INTEGER NOT NULL DEFAULT 636,
    "startTls" BOOLEAN NOT NULL DEFAULT false,
    "tlsRejectUnauthorized" BOOLEAN NOT NULL DEFAULT true,
    "caCertificate" TEXT,
    "baseDn" TEXT NOT NULL,
    "bindDn" TEXT,
    "bindPasswordEnc" TEXT,
    "userFilter" TEXT NOT NULL DEFAULT '(&(objectClass=person)(|(uid={{username}})(sAMAccountName={{username}})(mail={{username}})))',
    "usernameAttribute" TEXT NOT NULL DEFAULT 'uid',
    "emailAttribute" TEXT NOT NULL DEFAULT 'mail',
    "firstNameAttribute" TEXT NOT NULL DEFAULT 'givenName',
    "lastNameAttribute" TEXT NOT NULL DEFAULT 'sn',
    "departmentAttribute" TEXT DEFAULT 'department',
    "timeoutMs" INTEGER NOT NULL DEFAULT 8000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LdapConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LdapConnection_name_key" ON "LdapConnection"("name");

ALTER TABLE "User"
  ADD COLUMN "authSource" "AuthSource" NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN "ldapConnectionId" TEXT,
  ADD COLUMN "ldapDn" TEXT,
  ADD COLUMN "ldapUsername" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_ldapConnectionId_fkey" FOREIGN KEY ("ldapConnectionId") REFERENCES "LdapConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Aynı bağlantıda bir dizin kullanıcısı yalnız bir kez eklenebilir.
CREATE UNIQUE INDEX "User_ldapConnectionId_ldapUsername_key" ON "User"("ldapConnectionId", "ldapUsername");
