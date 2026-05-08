// 회사별 커스텀 아이콘 (lucide-react 동일 스타일: outline only, stroke-width 2)
// viewBox 24x24, currentColor

interface IconProps {
  className?: string;
}

const SVG_PROPS = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// 용접: 로봇팔(바닥+1관절+사선암+2관절+수평암+헤드+노즐+와이어) + 끝에 불꽃
export function WeldingHelmetIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...SVG_PROPS} className={className}>
      {/* 바닥 */}
      <line x1="4" y1="21" x2="12" y2="21" />
      {/* 받침대 */}
      <line x1="8" y1="21" x2="8" y2="18" />
      {/* 1관절 (lower) */}
      <circle cx="8" cy="16.5" r="1.5" />
      {/* 1차 암 (사선) */}
      <line x1="7.4" y1="15.1" x2="5.1" y2="9.9" />
      {/* 2관절 (upper) */}
      <circle cx="4.5" cy="8.5" r="1.5" />
      {/* 2차 암 (수평) */}
      <line x1="6" y1="8.5" x2="15" y2="8.5" />
      {/* 토치 헤드 */}
      <rect x="15" y="5.5" width="5" height="6" rx="0.3" />
      {/* 노즐 (사다리꼴) */}
      <path d="M16 11.5 L17 13 L18 13 L19 11.5" />
      {/* 와이어 */}
      <line x1="17.5" y1="13" x2="17.5" y2="15.5" />
      {/* 불꽃 (4-point star) */}
      <path d="M17.5 16 L18 16.8 L18.8 17.3 L18 17.8 L17.5 18.6 L17 17.8 L16.2 17.3 L17 16.8 Z" />
    </svg>
  );
}

// 분체도장 건: 본체 + 그립 + 트리거 + 노즐 + 컵 + 3가닥 분사 라인
export function PowderCoatingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...SVG_PROPS} className={className}>
      {/* 본체 */}
      <rect x="2" y="7" width="11" height="5" rx="1" />
      {/* 권총 그립 */}
      <path d="M7 12 L6.3 18 Q6.3 19.5 7.8 19.5 H10.7 Q12.2 19.5 12.2 18 L11.5 12" />
      {/* 트리거 */}
      <path d="M9 13.5 L10 12.5 Q11 12 11.5 13" />
      {/* 노즐 */}
      <rect x="13" y="8" width="3" height="3" />
      {/* 컵 */}
      <circle cx="18" cy="9.5" r="1.5" />
      {/* 분사 라인 (3가닥) */}
      <line x1="20" y1="9.5" x2="23" y2="6.2" />
      <line x1="20" y1="9.5" x2="23" y2="9.5" />
      <line x1="20" y1="9.5" x2="23" y2="12.8" />
    </svg>
  );
}
