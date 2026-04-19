export function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let insideQuotes = false;

  const pushCell = () => {
    row.push(current.trim());
    current = "";
  };

  const pushRow = () => {
    if (row.length === 1 && row[0] === "") {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      pushCell();
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      pushCell();
      pushRow();
      continue;
    }

    current += char;
  }

  if (current || row.length) {
    pushCell();
    pushRow();
  }

  if (!rows.length) return [];

  const [headerRow, ...bodyRows] = rows;
  const headers = headerRow.map((header) => header.trim());

  return bodyRows
    .filter((bodyRow) => bodyRow.some((cell) => cell.trim() !== ""))
    .map((bodyRow) =>
      headers.reduce((acc, header, index) => {
        acc[header] = bodyRow[index] ?? "";
        return acc;
      }, {})
    );
}
