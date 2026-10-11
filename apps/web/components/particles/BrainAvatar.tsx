"use client";

import { ParticleSignature } from "./ParticleSignature";
import { PixelPortrait } from "./PixelPortrait";

export type AvatarSubject = {
  handle: string;
  color: string;
  avatar?: string;
  postsParsed: number | null;
  postsPerDay: number | null;
};

/** An intelligence's face: its living pixel portrait when a PFP is set, otherwise its particle signature, both in the brain's color. */
export function BrainAvatar({ it, size, active, style, className }: { it: AvatarSubject; size: number; active?: boolean; style?: React.CSSProperties; className?: string }) {
  return it.avatar ? (
    <PixelPortrait src={it.avatar} color={it.color} size={size} active={active} style={style} className={className} />
  ) : (
    <ParticleSignature handle={it.handle} postsParsed={it.postsParsed} postsPerDay={it.postsPerDay} size={size} active={active} color={it.color} style={style} className={className} />
  );
}
