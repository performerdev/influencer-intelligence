import { ImageResponse } from "next/og";

import { brainSvg } from "@/lib/brain-svg";
import { normalizeRefs } from "@/lib/refs";
import { findIntelligence } from "@/lib/server/data";
import { ogFonts } from "@/lib/server/og-fonts";
import { loadShare } from "@/lib/server/share";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A shared answer from an Influencer Intelligence brain";

const clip = (s: string, n: number) => (Array.from(s).length > n ? `${Array.from(s).slice(0, n).join("").trimEnd()}…` : s);
const VERDICT: Record<string, string> = { BUY: "#4ADE80", SELL: "#F87171" };

/** The share card: the brain in its color, the question, the answer. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await loadShare(id).catch(() => null);
  const it = s ? await findIntelligence(s.handle).catch(() => null) : null;
  const color = it?.color ?? "#B9B8B2";
  const brain = brainSvg(color, { step: 2, cell: 7 });
  const answer = s ? clip(normalizeRefs(s.answer).replace(/\s*\[post:\d+\]/g, "").replace(/\s+/g, " ").trim(), 260) : "This answer is no longer available.";
  const question = s?.question ? clip(s.question.replace(/\s+/g, " "), 110) : null;
  const long = answer.length > 170;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#050506", color: "#F2F1EC", fontFamily: "Geist", padding: 56 }}>
        <div style={{ width: 360, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontFamily: "Geist Pixel", fontSize: 22, color: "#8A8984" }}>Influencer Intelligence</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/svg+xml;base64,${Buffer.from(brain.svg).toString("base64")}`} width={brain.width} height={brain.height} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: "Geist Pixel", fontSize: 20, color }}>{s?.code ?? "ii"}</div>
            <div style={{ display: "flex", fontFamily: "Geist Pixel", fontSize: 40, marginTop: 6 }}>@{s?.handle ?? "brain"}</div>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", marginLeft: 56, paddingLeft: 48, borderLeft: "2px solid #1C1C1F" }}>
          {question && (
            <div style={{ display: "flex", alignSelf: "flex-end", maxWidth: 620, background: "#111113", border: "2px solid #1C1C1F", padding: "16px 20px", fontSize: 26, color: "#B9B8B2", lineHeight: 1.35 }}>
              {question}
            </div>
          )}
          <div style={{ display: "flex", marginTop: question ? 30 : 0, fontSize: long ? 31 : 38, lineHeight: 1.38, color: "#F2F1EC", flex: 1 }}>{answer}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
            <div style={{ display: "flex", fontFamily: "Geist Pixel", fontSize: 22, color: "#8A8984" }}>ii.plus · unofficial AI model · not financial advice</div>
            {s?.verdict && (
              <div style={{ display: "flex", fontFamily: "Geist Pixel", fontSize: 24, color: VERDICT[s.verdict] ?? "#F2F1EC", border: `2px solid ${VERDICT[s.verdict] ?? "#3A3A3F"}`, padding: "6px 18px" }}>
                {s.verdict}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: ogFonts() },
  );
}
