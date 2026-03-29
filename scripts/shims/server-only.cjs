// scripts/shims/server-only.cjs
// Shim that replaces the "server-only" package when running dev scripts with tsx.
// Loaded via: npx tsx --require ./scripts/shims/server-only.cjs <script>
// This makes it a no-op instead of throwing.
module.exports = {};
