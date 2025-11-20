require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const SHOPIFY_API_URL = `https://${process.env.SHOPIFY_STORE}/admin/api/2024-07/graphql.json`;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

app.post('/api/create-bundle', async (req, res) => {
  try {
    const products = req.body.products;
    const globalIds = products.map(p => `gid://shopify/Product/${p.productId}`);
    const mainProductId = `gid://shopify/Product/${req.body.mainProductId}`;
    const mainProductTitle = req.body.mainProductTitle || 'Bundle - Any 5 Pieces - 70% OFF';

    // Build GraphQL query to fetch product options
    const query = `
      {
        ${globalIds.map((id, index) => `
          product${index}: node(id: "${id}") {
            ... on Product {
              id
              options {
                id
                name
                values
              }
              variants(first: 1) {
                edges {
                  node {
                    price
                  }
                }
              }
            }
          }
        `).join('\n')}
      }
    `;

    const productResponse = await fetch(SHOPIFY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query }),
    });

    const productResult = await productResponse.json();
    const data = productResult.data;


    const components = products.map((product, index) => {
      const productData = data[`product${index}`];
      const variant = productData.variants.edges[0].node;
      const optionSelections = productData.options.map(opt => {
        const clientOption = product.options?.find(o => o.name.toLowerCase() === opt.name.toLowerCase());
        return {
          componentOptionId: opt.id,
          name: opt.name,
          values: clientOption ? [clientOption.value] : [opt.values[0]]
        };
      });

      return {
        productId: productData.id,
        quantity: product.quantity,
        optionSelections
      };
    });

    const bundleMutation = `
      mutation {
        productBundleUpdate(
          input: {
            productId: "${mainProductId}",
            title: "${mainProductTitle}",
            components: [
              ${components.map(component => `
                {
                  productId: "${component.productId}",
                  quantity: ${component.quantity},
                  optionSelections: [
                    ${component.optionSelections.map(selection => `
                      {
                        componentOptionId: "${selection.componentOptionId}",
                        name: "${selection.name}",
                        values: ["${selection.values[0]}"]
                      }
                    `).join(',')}
                  ]
                }
              `).join(',')}
            ]
          }
        ) {
          userErrors {
            field
            message
          }
          productBundleOperation {
            product {
              variants(first: 1) {
                edges {
                  node { 
                    id
                  }
                }
              }
            }
          }
        }
      }
    `;

    // const bundleMutation = `
    //  mutation {
    //   productBundleCreate(
    //     input: {
    //       title: "Bundle Builder",
    //       components: [
    //         {
    //           productId: "gid://shopify/Product/8393959112971",
    //           quantity: 1,
    //           optionSelections: [
    //             {
    //               componentOptionId: "gid://shopify/ProductOption/10687583912203",
    //               name: "Farbe",
    //               values: "Gold"
    //             }
    //           ]
    //         },
    //         {
    //           productId: "gid://shopify/Product/8393959112971",
    //           quantity: 2,
    //           optionSelections: [
    //             {
    //               componentOptionId: "gid://shopify/ProductOption/10687583912203",
    //               name: "Farbe",
    //               values: "Gold"
    //             }
    //           ]
    //         }
    //       ]
    //     }
    //   ) {
    //     userErrors {
    //       field
    //       message
    //     }
    //   }
    // }
    // `;

    const bundleResponse = await fetch(SHOPIFY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query: bundleMutation }),
    });

    const bundleData = await bundleResponse.json();
    console.log('Bundle Data:', bundleData);
    res.json(bundleData);

  } catch (error) {
    console.error('Unexpected server error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
