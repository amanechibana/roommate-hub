// Every word must match, in any order. Normalize accents for names and titles.
export function matchesSearch(query: string, ...fields: unknown[]): boolean {
  const normalize = (value: string) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
  const text = normalize(
    fields
      .map((field) =>
        typeof field === "string"
          ? field
          : field == null
            ? ""
            : JSON.stringify(field),
      )
      .join(" "),
  );
  return normalize(query)
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
