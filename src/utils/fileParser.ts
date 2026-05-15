import * as XLSX from 'xlsx';

/**
 * Detects file format and parses content accordingly
 * Supports: CSV, Excel (xlsx, xls), JSON
 */
export async function parseFileContent(file: File): Promise<string[][]> {
  const fileName = file.name.toLowerCase();
  const fileType = file.type;

  // Check if JSON
  if (fileName.endsWith('.json') || fileType === 'application/json') {
    return parseJSONFile(file);
  }

  // Check if Excel
  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || 
      fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      fileType === 'application/vnd.ms-excel') {
    return parseExcelFile(file);
  }

  // Default to CSV
  return parseCSVFile(file);
}

/**
 * Parses JSON file and converts to CSV-like format (array of arrays)
 */
async function parseJSONFile(file: File): Promise<string[][]> {
  const text = await readFileAsText(file);
  const jsonData = JSON.parse(text);
  
  // Handle different JSON structures
  let rows: any[] = [];
  
  if (Array.isArray(jsonData)) {
    rows = jsonData;
  } else if (jsonData.data && Array.isArray(jsonData.data)) {
    rows = jsonData.data;
  } else if (jsonData.products && Array.isArray(jsonData.products)) {
    rows = jsonData.products;
  } else if (jsonData.suppliers && Array.isArray(jsonData.suppliers)) {
    rows = jsonData.suppliers;
  } else {
    // Try to extract array from object values
    const values = Object.values(jsonData);
    if (values.length > 0 && Array.isArray(values[0])) {
      rows = values[0];
    } else {
      throw new Error('JSON structure not recognized. Expected array or object with data/products/suppliers array.');
    }
  }

  if (rows.length === 0) {
    throw new Error('No data found in JSON file');
  }

  // Convert array of objects to array of arrays (CSV-like format)
  const headers = Object.keys(rows[0]);
  const result: string[][] = [headers];
  
  rows.forEach((row: any) => {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    });
    result.push(values);
  });

  return result;
}

/**
 * Parses Excel file (xlsx, xls) and converts to CSV-like format
 */
async function parseExcelFile(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON first, then to array of arrays
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        // Filter out completely empty rows
        const rows = (jsonData as any[][]).filter(row => 
          row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
        );
        
        if (rows.length === 0) {
          reject(new Error('Excel file appears to be empty'));
          return;
        }

        resolve(rows as string[][]);
      } catch (error) {
        reject(new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read Excel file'));
    };
    
    reader.readAsBinaryString(file);
  });
}

/**
 * Parses CSV file
 */
async function parseCSVFile(file: File): Promise<string[][]> {
  const text = await readFileAsText(file);
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('CSV file appears to be empty');
  }

  // Parse CSV lines (handle quoted values and commas)
  const rows: string[][] = [];
  for (const line of lines) {
    const parsed = parseCSVLine(line);
    if (parsed.length > 0) {
      rows.push(parsed);
    }
  }

  return rows;
}

/**
 * Helper to read file as text
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target?.result as string);
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current.trim());
  
  return result;
}

/**
 * Get file format description
 */
export function getFileFormatDescription(file: File): string {
  const fileName = file.name.toLowerCase();
  const fileType = file.type;

  if (fileName.endsWith('.json') || fileType === 'application/json') {
    return 'JSON';
  }
  if (fileName.endsWith('.xlsx') || fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return 'Excel (XLSX)';
  }
  if (fileName.endsWith('.xls') || fileType === 'application/vnd.ms-excel') {
    return 'Excel (XLS)';
  }
  if (fileName.endsWith('.csv') || fileType === 'text/csv') {
    return 'CSV';
  }
  return 'Unknown';
}

