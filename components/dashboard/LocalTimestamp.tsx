"use client";

import { useEffect, useState } from "react";

const FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * Renders a timestamp in the *browser's* local timezone.
 *
 * The timestamp is passed as an ISO string and formatted on the client, so the
 * displayed time follows the viewer's timezone rather than the server's (which
 * is UTC on Vercel). To avoid a hydration mismatch, the SSR / first-paint value
 * is formatted in a timezone-deterministic way (UTC) — identical on server and
 * client — and then switched to local time in an effect after mount.
 */
export default function LocalTimestamp({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() =>
    new Intl.DateTimeFormat("en", { ...FORMAT, timeZone: "UTC" }).format(new Date(iso)),
  );

  useEffect(() => {
    setLabel(new Intl.DateTimeFormat("en", FORMAT).format(new Date(iso)));
  }, [iso]);

  return <span suppressHydrationWarning>{label}</span>;
}
