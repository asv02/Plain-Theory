/**
 * Applies Plain Thread checkout branding via Shopify Admin GraphQL API.
 * Requires SHOPIFY_STORE and SHOPIFY_ADMIN_ACCESS_TOKEN env vars.
 * Token needs write_checkout_branding_settings scope (Checkout editor / Plus).
 */

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_CLI_THEME_TOKEN;
const API_VERSION = '2025-01';

const COLORS = {
  background: '#F7F5EF',
  text: '#121212',
  accent: '#121212',
  buttonBg: '#121212',
  buttonText: '#F7F5EF',
  formBg: '#FFFFFF',
  border: '#1212121F',
};

async function adminGraphql(query, variables = {}) {
  const response = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join('; '));
  }
  return payload.data;
}

async function getPublishedCheckoutProfileId() {
  const data = await adminGraphql(`
    query {
      checkoutProfiles(first: 10) {
        nodes {
          id
          isPublished
          name
        }
      }
    }
  `);

  const published = data.checkoutProfiles.nodes.find((p) => p.isPublished);
  return published?.id || data.checkoutProfiles.nodes[0]?.id;
}

async function applyBranding(checkoutProfileId) {
  const checkoutBrandingInput = {
    designSystem: {
      colors: {
        global: {
          accent: COLORS.accent,
          brand: COLORS.accent,
        },
        schemes: {
          scheme1: {
            base: {
              background: COLORS.background,
              text: COLORS.text,
              accent: COLORS.accent,
              border: COLORS.border,
              icon: COLORS.text,
              decorative: COLORS.text,
            },
            control: {
              background: COLORS.formBg,
              text: COLORS.text,
              accent: COLORS.accent,
              border: COLORS.border,
              selected: {
                background: COLORS.buttonBg,
                text: COLORS.buttonText,
                accent: COLORS.buttonText,
                border: COLORS.buttonBg,
              },
            },
            primaryButton: {
              background: COLORS.buttonBg,
              text: COLORS.buttonText,
              accent: COLORS.buttonText,
              border: COLORS.buttonBg,
              hover: {
                background: '#000000',
                text: COLORS.buttonText,
                border: '#000000',
              },
            },
            secondaryButton: {
              background: 'transparent',
              text: COLORS.text,
              border: COLORS.border,
            },
          },
        },
      },
    },
    customizations: {
      header: { colorScheme: 'COLOR_SCHEME1' },
      main: { section: { colorScheme: 'COLOR_SCHEME1' } },
      orderSummary: { colorScheme: 'COLOR_SCHEME1' },
      footer: { colorScheme: 'COLOR_SCHEME1', position: 'END' },
    },
  };

  const data = await adminGraphql(
    `
    mutation checkoutBrandingUpsert($checkoutProfileId: ID!, $checkoutBrandingInput: CheckoutBrandingInput!) {
      checkoutBrandingUpsert(checkoutProfileId: $checkoutProfileId, checkoutBrandingInput: $checkoutBrandingInput) {
        checkoutBranding {
          designSystem {
            colors {
              global {
                accent
                brand
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
    { checkoutProfileId, checkoutBrandingInput }
  );

  const errors = data.checkoutBrandingUpsert.userErrors;
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join('; '));
  }

  return data.checkoutBrandingUpsert.checkoutBranding;
}

function printManualSteps() {
  console.log(`
Checkout branding could not be applied via API.
Apply manually in Shopify Admin → Settings → Checkout → Customize:

  Header background:  ${COLORS.background}
  Header accent:      ${COLORS.accent}
  Main background:    ${COLORS.background}
  Order summary bg:   ${COLORS.background}
  Accent / links:     ${COLORS.accent}
  Buttons:            ${COLORS.buttonBg} (text ${COLORS.buttonText})
  Form fields:        White
  Store name:         Plain Thread (Settings → Store details)
`);
}

async function main() {
  if (!STORE || !TOKEN) {
    console.warn('Missing SHOPIFY_STORE or SHOPIFY_ADMIN_ACCESS_TOKEN — skipping checkout branding.');
    printManualSteps();
    process.exit(0);
  }

  try {
    const profileId = await getPublishedCheckoutProfileId();
    if (!profileId) {
      throw new Error('No checkout profile found.');
    }

    await applyBranding(profileId);
    console.log('Checkout branding applied:', COLORS);
  } catch (error) {
    console.warn('Checkout branding API failed:', error.message);
    printManualSteps();
    process.exit(0);
  }
}

main();
