export const handbookSections = [
  { id: "wifi", label: "Wi-Fi", hint: "Networks, passwords, and router notes" },
  {
    id: "contacts",
    label: "Building contacts",
    hint: "Landlord, super, management, and emergencies",
  },
  {
    id: "trash",
    label: "Trash & recycling",
    hint: "Collection days, set-out times, and sorting",
  },
  {
    id: "appliances",
    label: "Appliances",
    hint: "Model numbers, instructions, and manuals",
  },
  {
    id: "other",
    label: "Good to know",
    hint: "Anything the house needs handy",
  },
] as const;

export type HandbookSection = (typeof handbookSections)[number]["id"];
export type HandbookEntry = {
  id: string;
  household_id: string;
  section: HandbookSection;
  title: string;
  value: string;
  notes: string;
  sort_order: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};
export type HandbookFile = {
  id: string;
  household_id: string;
  entry_id: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_by: string;
  created_at: string;
};

export const handbookFileTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const handbookFileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
