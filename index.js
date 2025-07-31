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
  //console.log(req.body, 'Request body received');

  try {
    const products = req.body.products; // [{ productId, quantity }]
    console.log(products, 'Products received from client');
    // Convert product IDs to global Shopify IDs
    const globalIds = products.map(p => `gid://shopify/Product/${p.productId}`);

    // Build dynamic GraphQL query to fetch product details
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
            }
          }
        `).join('\n')}
      }
    `;

    // Fetch product data
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

    console.log(data, 'Product data fetched from Shopify');

    const components = products.map((product, index) => {
    const productData = data[`product${index}`];

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


    // Build the bundle mutation
    const mutation = `
      mutation {
        productBundleUpdate(
          input: {
            productId: "gid://shopify/Product/10656455196939",
            title: "Custom Bundle",
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

    // Send the mutation
    const mutationResponse = await fetch(SHOPIFY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query: mutation }),
    });

    const mutationResult = await mutationResponse.json();
    console.log('Bundle Created Response:', mutationResult);
    res.json(mutationResult);

  } catch (error) {
    console.error('Unexpected server error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
