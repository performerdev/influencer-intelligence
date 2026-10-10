/**
 * next/link stand-in for the standalone hero preview: in-page anchors scroll,
 * routes that don't exist in the preview stay put.
 */
import { forwardRef } from "react";

import { scrollToTarget } from "@/components/layout/SmoothScroll";

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean };

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, onClick, prefetch: _p, ...rest }, ref) {
  return (
    <a
      ref={ref}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (!href.startsWith("/")) return;
        e.preventDefault();
        if (href === "/") scrollToTarget(0);
        else if (href.startsWith("/#")) scrollToTarget(href.slice(1));
      }}
      {...rest}
    />
  );
});

export default Link;
