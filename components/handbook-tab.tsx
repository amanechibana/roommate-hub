"use client";

import { Button } from "@/components/ui/button";
import { PaperDialog } from "@/components/ui/dialog";
import {
  handbookFileSize,
  handbookSections,
  type HandbookEntry,
  type HandbookSection,
} from "@/lib/handbook";
import { type HandbookValues, useHandbook } from "@/lib/use-handbook";
import {
  ExternalLink,
  FileText,
  LoaderCircle,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import SearchField from "./search-field";
import { matchesSearch } from "@/lib/search";
import styles from "./handbook-tab.module.css";

export default function HandbookTab({
  active,
  demo,
  readOnly,
}: {
  active: boolean;
  demo: boolean;
  readOnly: boolean;
}) {
  const [query, setQuery] = useState("");
  const handbook = useHandbook({ enabled: active, demo });
  const [editing, setEditing] = useState<{
    section: HandbookSection;
    entry?: HandbookEntry;
  } | null>(null);

  if (!handbook.loaded && !demo)
    return (
      <div className={styles.loading} role="status">
        <LoaderCircle size={18} aria-hidden="true" /> Opening the handbook…
      </div>
    );

  return (
    <>
      {handbook.error && (
        <div className="error" role="alert">
          {handbook.error}
          <Button
            className="icon-button"
            aria-label="Dismiss handbook error"
            onClick={() => handbook.setError("")}
          >
            <X size={16} />
          </Button>
        </div>
      )}
      <p className={styles.intro}>
        The details you need at home, kept separate from the changing fridge
        notes. File links expire shortly after they open.
      </p>
      <SearchField label="Search handbook" value={query} onChange={setQuery} />
      <div className={styles.sections}>
        {handbookSections.map((section) => {
          const entries = handbook.entries.filter(
            (entry) =>
              entry.section === section.id &&
              matchesSearch(
                query,
                section.label,
                entry.title,
                entry.value,
                entry.notes,
                handbook.files
                  .filter((file) => file.entry_id === entry.id)
                  .map((file) => file.file_name),
              ),
          );
          return (
            <section
              className={styles.section}
              key={section.id}
              aria-labelledby={`handbook-${section.id}`}
            >
              <header>
                <div>
                  <h2 id={`handbook-${section.id}`}>{section.label}</h2>
                  <p>{section.hint}</p>
                </div>
                {!readOnly && (
                  <Button
                    className="button small secondary"
                    onClick={() => setEditing({ section: section.id })}
                  >
                    <Plus size={15} /> Add
                  </Button>
                )}
              </header>
              <div className={styles.cards}>
                {entries.map((entry) => (
                  <HandbookCard
                    key={entry.id}
                    entry={entry}
                    files={handbook.files.filter(
                      (file) => file.entry_id === entry.id,
                    )}
                    filesEnabled={handbook.filesEnabled}
                    readOnly={readOnly}
                    busy={handbook.busy}
                    onEdit={() => setEditing({ section: entry.section, entry })}
                    onDelete={() => void handbook.remove(entry).catch(() => {})}
                    onUpload={(file) => handbook.upload(entry, file)}
                    onRemoveFile={handbook.removeFile}
                  />
                ))}
                {!entries.length && (
                  <p className={styles.empty}>
                    {query
                      ? "No matches in this section."
                      : "Nothing saved here yet."}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {editing && (
        <HandbookDialog
          editing={editing}
          busy={handbook.busy}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            await handbook.save(values, editing.entry);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function HandbookCard({
  entry,
  files,
  filesEnabled,
  readOnly,
  busy,
  onEdit,
  onDelete,
  onUpload,
  onRemoveFile,
}: {
  entry: HandbookEntry;
  files: ReturnType<typeof useHandbook>["files"];
  filesEnabled: boolean;
  readOnly: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpload: (file: File) => Promise<void>;
  onRemoveFile: ReturnType<typeof useHandbook>["removeFile"];
}) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <article className={styles.card}>
      <div className={styles.cardHeading}>
        <h3>{entry.title}</h3>
        {!readOnly && (
          <span className={styles.actions}>
            <Button
              className="icon-button"
              aria-label={`Edit ${entry.title}`}
              onClick={onEdit}
            >
              <Pencil size={15} />
            </Button>
            <Button
              className="icon-button"
              aria-label={`Delete ${entry.title}`}
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 size={15} />
            </Button>
          </span>
        )}
      </div>
      {entry.value && <p className={styles.value}>{entry.value}</p>}
      {entry.notes && <p className={styles.notes}>{entry.notes}</p>}
      {!!files.length && (
        <ul className={styles.files}>
          {files.map((file) => (
            <li key={file.id}>
              <a
                href={`/api/handbook/files?id=${encodeURIComponent(file.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={15} />
                <span>{file.file_name}</span>
                <small>{handbookFileSize(file.size_bytes)}</small>
                <ExternalLink size={13} />
              </a>
              {!readOnly && (
                <Button
                  className="icon-button"
                  aria-label={`Remove ${file.file_name}`}
                  disabled={busy}
                  onClick={() => void onRemoveFile(file).catch(() => {})}
                >
                  <X size={14} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && filesEnabled && (
        <>
          <input
            ref={picker}
            className="flip-sr"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.docx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onUpload(file).catch(() => {});
              event.target.value = "";
            }}
          />
          <Button
            className={`text-button ${styles.attach}`}
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            <Paperclip size={14} /> Attach a file
          </Button>
        </>
      )}
    </article>
  );
}

function HandbookDialog({
  editing,
  busy,
  onClose,
  onSave,
}: {
  editing: { section: HandbookSection; entry?: HandbookEntry };
  busy: boolean;
  onClose: () => void;
  onSave: (values: HandbookValues) => Promise<void>;
}) {
  const [validation, setValidation] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "").trim();
    if (!title) {
      setValidation("Give this detail a title.");
      return;
    }
    setValidation("");
    try {
      await onSave({
        section: String(data.get("section")) as HandbookSection,
        title,
        value: String(data.get("value") || "").trim(),
        notes: String(data.get("notes") || "").trim(),
      });
    } catch {}
  }
  return (
    <PaperDialog
      onClose={onClose}
      className={`entry-dialog ${styles.dialog}`}
      aria-labelledby="handbook-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="dialog-heading">
          <h2 id="handbook-dialog-title">
            {editing.entry ? "Edit handbook detail" : "Add handbook detail"}
          </h2>
          <Button
            type="button"
            className="icon-button"
            aria-label="Close handbook detail"
            onClick={onClose}
          >
            <X size={20} />
          </Button>
        </div>
        <label>
          Section
          <select
            name="section"
            defaultValue={editing.entry?.section || editing.section}
          >
            {handbookSections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={editing.entry?.title}
            placeholder="Guest Wi-Fi, super, dishwasher…"
            autoFocus
          />
        </label>
        <label>
          Details
          <textarea
            name="value"
            rows={4}
            maxLength={4000}
            defaultValue={editing.entry?.value}
            placeholder="The information someone needs at a glance"
          />
        </label>
        <label>
          Extra notes
          <textarea
            name="notes"
            rows={3}
            maxLength={4000}
            defaultValue={editing.entry?.notes}
            placeholder="Where to find it, when to use it, or anything else"
          />
        </label>
        {validation && (
          <p className="error" role="alert">
            {validation}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save detail"}
          </Button>
        </div>
      </form>
    </PaperDialog>
  );
}
