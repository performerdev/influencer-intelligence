"use client";

import { ParticleSignature } from "./ParticleSignature";
import { PixelBrain } from "./PixelBrain";
import { PixelPortrait } from "./PixelPortrait";

export type AvatarSubject = {
  handle: string;
  color: string;
  avatar?: string;
  postsParsed: number | null;
  postsPerDay: number | null;
};

/**
 * An intelligence's face, in the brain's color: a rotating pixel brain. With a
 * PFP, the brain is built from the PFP and unfolds into it every few seconds;
 * at tiny sizes (chat bylines) the PFP is shown as pixels directly.
 */
export function BrainAvatar({ it, size, active, style, className }: { it: AvatarSubject; size: number; active?: boolean; style?: React.CSSProperties; className?: string }) {
  if (it.avatar && size >= 40) return <PixelBrain handle={it.handle} src={it.avatar} color={it.color} size={size} active={active} style={style} className={className} />;
  return it.avatar ? (
    <PixelPortrait src={it.avatar} color={it.color} size={size} active={active} style={style} className={className} />
  ) : (
    <ParticleSignature handle={it.handle} postsParsed={it.postsParsed} postsPerDay={it.postsPerDay} size={size} active={active} color={it.color} style={style} className={className} />
  );
}
