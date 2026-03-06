import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#00FF94'
    case 'B': return '#4ADE80'
    case 'C': return '#FFB800'
    case 'D': return '#FF8C00'
    default: return '#FF3B5C'
  }
}

function scoreColor(score: number): string {
  if (score >= 750) return '#00FF94'
  if (score >= 650) return '#4ADE80'
  if (score >= 550) return '#FFB800'
  if (score >= 450) return '#FF8C00'
  return '#FF3B5C'
}

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  const { address } = params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chainscore.xyz'

  let score = 300
  let grade = 'F'
  let ens: string | null = null
  let percentile = 1

  try {
    const res = await fetch(`${appUrl}/api/score/${address}`, {
      next: { revalidate: 3600 },
    })
    if (res.ok) {
      const data = await res.json()
      score = data.score
      grade = data.grade
      ens = data.ens
      percentile = data.percentile
    }
  } catch {
    // use defaults
  }

  const displayAddress = ens || `${address.slice(0, 6)}...${address.slice(-4)}`
  const color = scoreColor(score)
  const gColor = gradeColor(grade)

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: '#0A0A0F',
          display: 'flex',
          flexDirection: 'column',
          padding: '60px',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Subtle gradient background */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(ellipse at top left, #0D1F1A 0%, #0A0A0F 60%)',
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              background: '#00FF94',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 700,
              color: '#0A0A0F',
            }}
          >
            C
          </div>
          <span style={{ color: '#E8EDF5', fontSize: 28, fontWeight: 700 }}>
            ChainScore
          </span>
        </div>

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          {/* Left: address + label */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ color: '#5A6478', fontSize: 24, margin: 0 }}>
              On-chain credit score for
            </p>
            <p
              style={{
                color: '#E8EDF5',
                fontSize: 36,
                fontWeight: 700,
                margin: 0,
                maxWidth: 580,
              }}
            >
              {displayAddress}
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginTop: 8,
              }}
            >
              <div
                style={{
                  background: '#0D1117',
                  border: '1px solid #1C2333',
                  borderRadius: 8,
                  padding: '8px 20px',
                  color: '#5A6478',
                  fontSize: 20,
                }}
              >
                Top {100 - percentile + 1}% of wallets
              </div>
            </div>
          </div>

          {/* Right: score */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                fontSize: 160,
                fontWeight: 800,
                color,
                lineHeight: 1,
              }}
            >
              {score}
            </div>
            <div
              style={{
                fontSize: 56,
                fontWeight: 700,
                color: gColor,
                background: `${gColor}22`,
                border: `2px solid ${gColor}`,
                borderRadius: 16,
                padding: '4px 28px',
              }}
            >
              {grade}
            </div>
            <p style={{ color: '#5A6478', fontSize: 20, margin: 0 }}>
              300–850 scale
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          <p style={{ color: '#5A6478', fontSize: 18, margin: 0 }}>
            Free Ethereum wallet credit scoring
          </p>
          <p style={{ color: '#5A6478', fontSize: 18, margin: 0 }}>
            chainscore.xyz
          </p>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
