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

    // Convert product IDs to global Shopify IDs
    const globalIds = products.map(p => `gid://shopify/Product/${p.productId}`);

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

    // Build components array & calculate total price
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
        optionSelections,
        price: parseFloat(variant.price)
      };
    });

    const totalPrice = components.reduce((sum, c) => sum + (c.price * c.quantity), 0).toFixed(2);

    // === UPDATE BUNDLE PRODUCT ===
    const bundleMutation = `
      mutation {
        productBundleUpdate(
          input: {
            productId: "gid://shopify/Product/10656455196939",
            title: "Bundle",
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


    const variantId = bundleData?.data?.productBundleUpdate?.productBundleOperation?.product?.variants?.edges[0]?.node?.id;

    if (!variantId) {
      return res.status(500).json({ error: 'Failed to get variant ID for bundle' });
    }

    // === UPDATE VARIANT PRICE ===
    // const priceMutation = `
    //   mutation {
    //     productVariantUpdate(
    //       input: {
    //         id: "${variantId}",
    //         price: "${totalPrice}"
    //       }
    //     ) {
    //       productVariant {
    //         id
    //         price
    //       }
    //       userErrors {
    //         field
    //         message
    //       }
    //     }
    //   }
    // `;

    // const priceResponse = await fetch(SHOPIFY_API_URL, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    //   },
    //   body: JSON.stringify({ query: priceMutation }),
    // });

    // const priceData = await priceResponse.json();

    // res.json({
    //   message: 'Bundle updated and price set successfully.',
    //   totalPrice,
    //   bundleResponse: bundleData,
    //   priceResponse: priceData
    // });

  } catch (error) {
    console.error('Unexpected server error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
