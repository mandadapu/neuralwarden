import { SEVERITY_COLORS } from "@/lib/constants";

interface SeverityGaugeProps {
  score: number; // 0-10 from risk_score
  risk: string;
}

export default function SeverityGauge({ score, risk }: SeverityGaugeProps) {
  const color = SEVERITY_COLORS[risk] ?? "#6b7280";
  const displayScore = Math.round(score * 10);
  const radius = 45;
  const strokeWidth = 8;
  const circumference = Math.PI * radius;
  const filled = (score / 10) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="60" viewBox="0 0 120 70">
        {/* Background arc */}
        <path
          d="M 15 60 A 45 45 0 0 1 105 60"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d="M 15 60 A 45 45 0 0 1 105 60"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
        />
        {/* Score text */}
        <text
          x="60"
          y="52"
          textAnchor="middle"
          fontSize="24"
          fontWeight="700"
          fill={color}
        >
          {displayScore}
        </text>
        <text
          x="60"
          y="66"
          textAnchor="middle"
          fontSize="10"
          fill="#9ca3af"
        >
          {risk.charAt(0).toUpperCase() + risk.slice(1)}
        </text>
      </svg>
    </div>
  );
}
