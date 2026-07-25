const fs = require("fs");
const path = require("path");

const swPath = path.join(__dirname, "..", "public", "sw.js");

if (!fs.existsSync(swPath)) {
  console.log("sw.js not found, skipping Monetag patch");
  process.exit(0);
}

const existing = fs.readFileSync(swPath, "utf8");

if (existing.includes("3nbf4.com")) {
  console.log("sw.js already contains Monetag code, skipping");
  process.exit(0);
}

const monetagCode = `
// Monetag Service Worker
self.options = self.options || {};
self.options.domain = "3nbf4.com";
self.options.zoneId = 11404736;
self.lary = "";
importScripts("https://3nbf4.com/act/files/service-worker.min.js?r=sw");
`;

fs.appendFileSync(swPath, monetagCode);
console.log("Monetag code appended to sw.js");
