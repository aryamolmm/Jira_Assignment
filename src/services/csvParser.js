export const parseCSV = (csvText) => {
  const result = [];
  let row = [];
  let inQuotes = false;
  let currentValue = '';
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      currentValue += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(currentValue);
      currentValue = '';
    } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
      row.push(currentValue);
      result.push(row);
      row = [];
      currentValue = '';
      if (char === '\r') i++;
    } else {
      currentValue += char;
    }
  }
  
  if (currentValue || row.length > 0) {
    row.push(currentValue);
    result.push(row);
  }
  
  return result;
};

export const csvToJson = (csvText) => {
  const parsed = parseCSV(csvText);
  if (parsed.length < 2) return [];
  
  const headers = parsed[0].map(h => h.trim());
  const json = [];
  
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].length === 1 && !parsed[i][0]) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = parsed[i][j] || '';
    }
    json.push(obj);
  }
  
  return json;
};

export const parseHTMLTable = (htmlText) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];
  
  const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  
  const json = [];
  for (const tr of rows) {
    const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cells[j] || '';
    }
    json.push(obj);
  }
  
  return json;
};
