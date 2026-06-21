-- Quran Hub — MySQL schema for Hostinger
-- Run in phpMyAdmin on the NEW database (not the WordPress db)

CREATE TABLE IF NOT EXISTS halaqat (
  id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_talqeen TINYINT(1) NOT NULL DEFAULT 0,
  teacher_name VARCHAR(255) NOT NULL DEFAULT '—',
  teacher_code VARCHAR(50) NOT NULL DEFAULT '',
  assistant_name VARCHAR(255) NOT NULL DEFAULT '—',
  assistant_code VARCHAR(50) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_teacher_code (teacher_code),
  INDEX idx_assistant_code (assistant_code)
);

CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  halaqa_id INT NOT NULL,
  national_id VARCHAR(20) NOT NULL UNIQUE,
  parent_phone VARCHAR(30) DEFAULT '',
  level VARCHAR(10) DEFAULT '1',
  level_type ENUM('gold','silver') DEFAULT 'gold',
  assigned_to ENUM('teacher','assistant') NULL,
  memorized TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_halaqa (halaqa_id),
  INDEX idx_nid (national_id)
);

CREATE TABLE IF NOT EXISTS role_accounts (
  id CHAR(36) PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  permissions JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code (code)
);

CREATE TABLE IF NOT EXISTS app_state (
  `key` VARCHAR(100) PRIMARY KEY,
  value JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
