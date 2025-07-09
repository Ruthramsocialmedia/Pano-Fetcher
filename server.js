const express = require("express");
const acorn = require("acorn");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.text({ limit: "5mb" }));

// 🟡 Step 1: Read and parse en.txt at startup
const labelMap = {};
const labelOrder = []; // <== Maintain order from en.txt
const txtPath = path.join(__dirname, "locale", "en.txt");

try {
  const rawTxt = fs.readFileSync(txtPath, "utf-8");
  const labelLines = rawTxt.split("\n").filter((line) => line.includes("panorama_") && line.includes(".label ="));

  labelLines.forEach((line) => {
    const match = line.match(/panorama_([A-Z0-9_]+)\.label\s*=\s*(.+)/);
    if (match) {
      const id = match[1].trim();
      const label = match[2].trim().replace(/^"|"$/g, "");
      labelMap[id] = label;
      labelOrder.push(id); // preserve the order
    }
  });
  console.log("✅ Loaded pano labels from en.txt:", Object.keys(labelMap).length, "entries");
} catch (err) {
  console.error("❌ Failed to load en.txt:", err.message);
}

app.post("/", (req, res) => {
  const rawCode = req.body;

  let ast;
  try {
    ast = acorn.parse(rawCode, { ecmaVersion: "latest", sourceType: "script" });
  } catch (err) {
    return res.status(400).json({ thumbnails: [], error: "Parse failed" });
  }

  let definitionsArray = [];

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "Property" &&
      (node.key?.name === "definitions" || node.key?.value === "definitions") &&
      node.value?.type === "ArrayExpression"
    ) {
      definitionsArray = node.value.elements;
    }
    for (const key in node) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (typeof child === "object" && child !== null) walk(child);
    }
  }

  walk(ast);

  const panoMap = {};

  definitionsArray.forEach((def) => {
    const properties = Object.fromEntries(
      def.properties.map((p) => [p.key.name || p.key.value, p.value])
    );
    if (properties.class?.value !== "Panorama") return;

    const id = properties.id?.value || "unknown";
    const thumb = properties.thumbnailUrl?.value || "";

    panoMap[id] = { id, thumb };
  });

  // ✅ Step 2: Build thumbnails in en.txt order
  const thumbnails = labelOrder
    .map((panoKey) => {
      const matchId = Object.keys(panoMap).find((id) => id.includes(panoKey));
      if (!matchId) return null;

      return {
        id: matchId,
        label: labelMap[panoKey],
        thumb: panoMap[matchId].thumb,
        uniqueKey: `${matchId}_${Math.random().toString(36).slice(2, 6)}`,
      };
    })
    .filter(Boolean);

  return res.json({ thumbnails });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ API running at http://localhost:${PORT}`);
});
