/**
 * Schema 版本管理
 */

const CURRENT_SCHEMA_VERSION = 1;

function getSchemaVersion() {
  return CURRENT_SCHEMA_VERSION;
}

module.exports = { CURRENT_SCHEMA_VERSION, getSchemaVersion };
