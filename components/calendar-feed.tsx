"use client";
import { useState } from "react";
import { CalendarPlus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homeRequest } from "@/lib/home-client";

// Subscribing beats exporting: the phone's calendar keeps itself current.
export default function CalendarFeed() {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function reveal() {
    setBusy(true);
    setMessage("");
    try {
      const { token } = await homeRequest("/api/calendar");
      setUrl(`${window.location.origin}/api/calendar/${token}`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage(
        "Link copied. Paste it where your calendar app asks for a subscription URL.",
      );
    } catch {
      setMessage("Couldn’t copy; select the link and copy it yourself.");
    }
  }

  return (
    <>
      <h3>Subscribe on your phone</h3>
      <p className="subtle">
        A private link your calendar app checks on its own, so new plans and
        chores show up without another export. Anyone with the link can read the
        household calendar; changing the household code revokes it.
      </p>
      {url ? (
        <div className="feed-link">
          <input
            readOnly
            value={url}
            aria-label="Calendar subscription link"
            onFocus={(e) =>
              e.currentTarget.setSelectionRange(0, e.currentTarget.value.length)
            }
          />
          <Button
            className="button secondary small"
            onClick={() => void copy()}
          >
            <Copy size={14} /> Copy
          </Button>
          <a
            className="button secondary small"
            href={url
              .replace(/^https:/, "webcals:")
              .replace(/^http:/, "webcal:")}
          >
            <CalendarPlus size={14} /> Open in calendar
          </a>
        </div>
      ) : (
        <Button
          className="button secondary"
          disabled={busy}
          onClick={() => void reveal()}
        >
          <CalendarPlus size={16} /> Show subscription link
        </Button>
      )}
      {message && <p className="subtle">{message}</p>}
    </>
  );
}
