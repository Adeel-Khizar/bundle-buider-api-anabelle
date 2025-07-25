require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const SHOPIFY_API_URL = `https://${process.env.SHOPIFY_STORE}/admin/api/2024-07/graphql.json`;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// app.post('/api/create-bundle', async (req, res) => {
//   console.log(req.body, 'Request body received');
//   // try {
//   //   const mutation = `
//   //     mutation {
//   //       productBundleCreate(
//   //         input: {
//   //           title: "Summer Pack",
//   //           components: [
//   //             {
//   //               productId: "gid://shopify/Product/10648364974347",
//   //               quantity: 1,
//   //               optionSelections: [
//   //                 {
//   //                   componentOptionId: "gid://shopify/ProductOption/12835215802635",
//   //                   name: "Silver",
//   //                   values: "Silver
//   //                 }
//   //               ]
//   //             }
//   //           ]
//   //         }
//   //       ) {
//   //         userErrors {
//   //           field
//   //           message
//   //         }
//   //       }
//   //     }
//   //   `;

//   //   const response = await fetch(SHOPIFY_API_URL, {
//   //     method: 'POST',
//   //     headers: {
//   //       'Content-Type': 'application/json',
//   //       'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
//   //     },
//   //     body: JSON.stringify({ query: mutation }),
//   //   });

//   //   const result = await response.json();
//   //   console.log('Shopify response:', result);
//   //   res.json(result);
//   // } catch (error) {
//   //   console.error('Unexpected server error:', error);
//   //   res.status(500).json({ error: 'Internal Server Error' });
//   // }

// try {
//   const products = req.body.products; // received from client

//   // Convert each numeric productId to Shopify global ID
//   const globalIds = products.map(p => `gid://shopify/Product/${p.productId}`);

//   // Build a dynamic GraphQL query using Shopify's `node` for each product
//   const query = `
//     {
//       ${globalIds.map((id, index) => `
//         product${index}: node(id: "${id}") {
//           ... on Product {
//             id
//             title
//             options {
//               id
//               name
//               values
//             }
//             variants(first: 10) {
//               edges {
//                 node {
//                   id
//                   title
//                 }
//               }
//             }
//           }
//         }
//       `).join('\n')}
//     }
//   `;

//   const response = await fetch(SHOPIFY_API_URL, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
//     },
//     body: JSON.stringify({ query }),
//   });

//   const result = await response.json();
//   res.json(result);
// } catch (error) {
//   console.error('Unexpected server error:', error);
//   res.status(500).json({ error: 'Internal Server Error' });
// }

// });



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

    const optionSelections = productData.options.map(opt => ({
      componentOptionId: opt.id,
      name: opt.name,
      values: [opt.values[0]] // pick the first available value
    }));

    return {
      productId: productData.id,
      quantity: product.quantity,
      optionSelections
    };
  });

    // Build the bundle mutation
    const mutation = `
      mutation {
        productBundleCreate(
          input: {
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
