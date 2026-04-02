const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const filePath = path.join(process.cwd(), "targeting.yml");

let config;

function loadConfig() {
  const fileContents = fs.readFileSync(filePath, "utf8");
  config = yaml.load(fileContents);
}

loadConfig();

function getTargetsConfig(target) {
  if (!config || !config.targets) return null;
  return config.targets[target];
}

module.exports = { getTargetsConfig };
