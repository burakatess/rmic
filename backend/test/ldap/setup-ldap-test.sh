#!/bin/sh
# İzole e2e testleri için yerel OpenLDAP (LDAP 1389 / LDAPS 1636). Üretimle ilgisi yoktur.
# Kullanım: sh test/ldap/setup-ldap-test.sh  → ardından E2E_LDAP_HOST=127.0.0.1 ile e2e çalıştırın.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
CERTS="$DIR/certs"
mkdir -p "$CERTS"
if [ ! -f "$CERTS/server.crt" ]; then
  # Kendinden imzalı test CA + sunucu sertifikası (SAN: localhost, 127.0.0.1)
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=RMIC Test LDAP CA" -keyout "$CERTS/ca.key" -out "$CERTS/ca.crt" >/dev/null 2>&1
  openssl req -newkey rsa:2048 -nodes -subj "/CN=localhost" -keyout "$CERTS/server.key" -out "$CERTS/server.csr" >/dev/null 2>&1
  printf "subjectAltName=DNS:localhost,IP:127.0.0.1\n" > "$CERTS/san.ext"
  openssl x509 -req -in "$CERTS/server.csr" -CA "$CERTS/ca.crt" -CAkey "$CERTS/ca.key" -CAcreateserial -days 3650 -extfile "$CERTS/san.ext" -out "$CERTS/server.crt" >/dev/null 2>&1
  chmod 644 "$CERTS"/*
fi
docker rm -f rmic_1-ldap-test >/dev/null 2>&1 || true
docker run -d --name rmic_1-ldap-test \
  -p 127.0.0.1:1389:1389 -p 127.0.0.1:1636:1636 \
  -e LDAP_ROOT=dc=rmic,dc=test -e LDAP_ADMIN_USERNAME=admin -e LDAP_ADMIN_PASSWORD=LdapAdmin!2026 \
  -e LDAP_SKIP_DEFAULT_TREE=yes -e LDAP_CUSTOM_LDIF_DIR=/ldifs \
  -e LDAP_ENABLE_TLS=yes -e LDAP_TLS_CERT_FILE=/certs/server.crt -e LDAP_TLS_KEY_FILE=/certs/server.key -e LDAP_TLS_CA_FILE=/certs/ca.crt \
  -v "$DIR/ldif:/ldifs:ro" -v "$CERTS:/certs:ro" \
  bitnamilegacy/openldap:2.6.10 >/dev/null
echo "rmic_1-ldap-test başlatıldı (LDAP 127.0.0.1:1389, LDAPS 127.0.0.1:1636)"
