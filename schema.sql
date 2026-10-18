CREATE DATABASE IF NOT EXISTS secure_upload
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE secure_upload;

-- Metadane plików. Same pliki leżą na dysku w backend/uploads/<wersja>/.
-- Tabela jest wspólna dla obu wersji, kolumna version mówi, która wersja zapisała wpis.
CREATE TABLE IF NOT EXISTS files (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version       ENUM('vulnerable', 'secure') NOT NULL,
  owner         VARCHAR(32)  NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  size          INT UNSIGNED NOT NULL,
  path          VARCHAR(512) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_files_owner (version, owner)
);
