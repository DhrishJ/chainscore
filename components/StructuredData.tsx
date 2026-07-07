// schema.org structured data (Phase 5 SEO). The Organization description is
// deliberately a disambiguation statement: "ChainScore" collides with a
// dormant protocol (chainscore.finance, $SCORE token), a dev shop
// (Chainscore Labs), and hackathon repos. The schema states exactly what
// THIS ChainScore is and where it lives. sameAs stays empty until real
// social profiles exist (FACTS_TODO of the SEO doc); fake links are worse
// than none.

const BASE = 'https://chainscore.dev'

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${BASE}/#organization`,
  name: 'ChainScore',
  url: BASE,
  description:
    'ChainScore (chainscore.dev) is credit risk infrastructure for onchain lending: a 300 to 850 borrower credit score computed from public blockchain lending history, with calibrated default probability and a published backtest, served via API. Not affiliated with chainscore.finance or Chainscore Labs.',
  knowsAbout: [
    'onchain credit score',
    'DeFi underwriting',
    'wallet risk score',
    'borrower reputation',
    'crypto lending risk',
  ],
}

const webSite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${BASE}/#website`,
  url: BASE,
  name: 'ChainScore',
  publisher: { '@id': `${BASE}/#organization` },
}

const softwareApplication = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ChainScore API',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  url: `${BASE}/#api`,
  description:
    'Versioned REST API returning onchain borrower credit scores (300 to 850) with calibrated default probability, factor breakdown, integrity signals, and data completeness. Hashed bearer-key auth, signed webhooks, OpenAPI 3.1.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free wallet score checks on the website; API access on request.',
  },
  provider: { '@id': `${BASE}/#organization` },
}

export function StructuredData() {
  return (
    <>
      {[organization, webSite, softwareApplication].map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  )
}
