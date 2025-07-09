const express = require("express");
const acorn = require("acorn");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.text({ limit: "5mb" }));

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

  const thumbnails = definitionsArray
    .map((def) => {
      const properties = Object.fromEntries(
        def.properties.map((p) => [p.key.name || p.key.value, p.value])
      );

      if (properties.class?.value !== "Panorama") return null;

      const id = properties.id?.value || "unknown";
      const thumb = properties.thumbnailUrl?.value || "";
      const rawLabel =
        properties.data?.properties.find((p) => p.key.name === "label")?.value?.value || null;

      return {
        id,
        thumb,
        rawLabel,
      };
    })
    .filter(Boolean);

  return res.json({ thumbnails });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ API running at http://localhost:${PORT}`);
});
