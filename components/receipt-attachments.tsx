"use client";
import { useState } from "react";
import type { Expense } from "@/lib/expenses";
import { Button } from "./ui/button";
export default function ReceiptAttachments({
  expense,
  onChanged,
}: {
  expense?: Expense;
  onChanged: () => void;
}) {
  const [files, setFiles] = useState(expense?.receipts ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File, input: HTMLInputElement) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("expense_id", expense!.id);
      body.set("file", file);
      const response = await fetch("/api/expenses/receipts", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not attach receipt.");
      setFiles((items) => [
        ...items,
        { id: data.file.id, file_name: data.file.file_name },
      ]);
      onChanged();
      input.value = "";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy} className="receipt-attachments">
      <legend>Receipt attachments</legend>
      {expense ? (
        <label>
          Attach receipt (PDF or image, up to 10 MB)
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file, event.target);
            }}
          />
        </label>
      ) : (
        <p className="subtle">
          Save this expense, then reopen it to attach a receipt.
        </p>
      )}
      {files.map((file) => (
        <div className="coverage-row" key={file.id}>
          <a
            href={`/api/expenses/receipts?id=${encodeURIComponent(file.id)}`}
            target="_blank"
            rel="noreferrer"
          >
            {file.file_name}
          </a>
          <Button
            type="button"
            className="text-button danger"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const response = await fetch("/api/expenses/receipts", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: file.id }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                setFiles((items) => items.filter((f) => f.id !== file.id));
                onChanged();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove receipt
          </Button>
        </div>
      ))}
      {busy && <p role="status">Saving receipt…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
