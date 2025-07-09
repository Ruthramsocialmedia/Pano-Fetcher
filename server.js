const express = require('express');
const cors = require('cors');
const acorn = require('acorn');
const prettier = require('prettier');

const app = express();
app.use(cors());
app.use(express.text({ type: '*/*' }));

app.post('/parse', async (req, res) => {
  try {
    const formatted = prettier.format(req.body, {
      parser: 'babel',
      plugins: [require('prettier/parser-babel')],
    });

    const ast = acorn.parse(formatted, { ecmaVersion: 'latest' });
    let definitions = [];

    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (
        node.type === 'Property' &&
        (node.key?.name === 'definitions' || node.key?.value === 'definitions') &&
        node.value?.type === 'ArrayExpression'
      ) {
        definitions = node.value.elements;
      }

      for (const key in node) {
        const child = node[key];
        if (Array.isArray(child)) child.forEach(walk);
        else if (typeof child === 'object') walk(child);
      }
    }

    walk(ast);

    const thumbnails = definitions
      .map((def) => {
        const props = Object.fromEntries(
          def.properties.map((p) => [p.key.name || p.key.value, p.value])
        );
        if (props.class?.value !== 'Panorama') return null;
        return {
          id: props.id?.value,
          label:
            props.data?.properties.find((p) => p.key.name === 'label')?.value.value,
          thumb: props.thumbnailUrl?.value,
        };
      })
      .filter(Boolean);

    res.json(thumbnails);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API running on port ${PORT}`));
